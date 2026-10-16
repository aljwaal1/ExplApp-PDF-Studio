package com.explapp.explapp_pdf_studio

import android.os.Bundle
import android.app.Activity
import android.content.Intent
import android.net.Uri
import java.io.FileInputStream
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.rendering.PDFRenderer
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.nio.charset.StandardCharsets
import java.io.FileOutputStream
import java.util.zip.ZipOutputStream
import java.util.zip.ZipEntry
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Color
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream.AppendMode

class MainActivity : FlutterActivity() {
    private var pendingSave: io.flutter.plugin.common.MethodChannel.Result? = null
    private var pendingSource: File? = null
    private val saveRequestCode = 64081

    @Deprecated("Android activity callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != saveRequestCode) return
        val callback = pendingSave ?: return
        val source = pendingSource
        pendingSave = null
        pendingSource = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null || source == null) {
            callback.success(null)
            return
        }
        Thread {
            try {
                contentResolver.openOutputStream(uri)?.use { output ->
                    FileInputStream(source).use { it.copyTo(output) }
                } ?: error("تعذر فتح مسار الحفظ")
                runOnUiThread { callback.success(uri.toString()) }
            } catch (e: Exception) {
                runOnUiThread { callback.error("SAVE_ERROR", e.message ?: "خطأ أثناء الحفظ", null) }
            }
        }.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PDFBoxResourceLoader.init(applicationContext)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.explapp.pdfstudio/native_pdf")
            .setMethodCallHandler { call, result ->
                if (call.method == "preview") {
                    val source = File(call.argument<String>("source") ?: "")
                    val page = call.argument<Int>("page") ?: 1
                    Thread {
                        try {
                            require(source.isFile) { "ملف المعاينة غير موجود" }
                            PDDocument.load(source).use { pdf ->
                                require(page in 1..pdf.numberOfPages) { "صفحة غير موجودة" }
                                val bitmap = PDFRenderer(pdf).renderImageWithDPI(page - 1, 105f)
                                val preview = File(cacheDir, "preview-${System.nanoTime()}.png")
                                try {
                                    FileOutputStream(preview).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                                } finally { bitmap.recycle() }
                                val value = mapOf("path" to preview.absolutePath, "total" to pdf.numberOfPages)
                                runOnUiThread { result.success(value) }
                            }
                        } catch (e: Exception) {
                            runOnUiThread { result.error("PREVIEW_ERROR", e.message, null) }
                        }
                    }.start()
                    return@setMethodCallHandler
                }
                if (call.method == "saveAs") {
                    if (pendingSave != null) { result.error("BUSY", "يوجد طلب حفظ مفتوح", null); return@setMethodCallHandler }
                    val source = File(call.argument<String>("source") ?: "")
                    if (!source.isFile) { result.error("INVALID_SOURCE", "ملف النتيجة غير موجود", null); return@setMethodCallHandler }
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = when(source.extension.lowercase()) {
                            "pdf" -> "application/pdf"
                            "txt" -> "text/plain"
                            "csv" -> "text/csv"
                            "html" -> "text/html"
                            "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            "zip" -> "application/zip"
                            else -> "application/octet-stream"
                        }
                        putExtra(Intent.EXTRA_TITLE, source.name)
                    }
                    pendingSave = result
                    pendingSource = source
                    try { startActivityForResult(intent, saveRequestCode) }
                    catch(e: Exception) { pendingSave = null; pendingSource = null; result.error("SAVE_ERROR", e.message, null) }
                    return@setMethodCallHandler
                }
                if (call.method != "process") { result.notImplemented(); return@setMethodCallHandler }
                val op = call.argument<String>("operation") ?: ""
                val inputs = call.argument<List<String>>("inputs") ?: emptyList()
                val dest = call.argument<String>("output") ?: ""
                val pages = call.argument<String>("pages") ?: "1"
                val degrees = call.argument<Int>("degrees") ?: 90
                val query = call.argument<String>("query") ?: ""
                Thread {
                    try {
                        require(inputs.isNotEmpty() && dest.isNotEmpty()) { "الملفات المطلوبة غير موجودة" }
                        val target = File(dest)
                        target.parentFile?.mkdirs()
                        when (op) {
                            "merge" -> {
                                require(inputs.size >= 2) { "يلزم ملفان على الأقل" }
                                val merger = PDFMergerUtility()
                                inputs.forEach { merger.addSource(File(it)) }
                                merger.destinationFileName = dest
                                merger.mergeDocuments(null)
                            }
                            "split" -> PDDocument.load(File(inputs[0])).use { source ->
                                val selected = parsePages(pages, source.numberOfPages)
                                PDDocument().use { output ->
                                    selected.forEach { i -> output.importPage(source.getPage(i)) }
                                    output.save(target)
                                }
                            }
                            "delete" -> PDDocument.load(File(inputs[0])).use { source ->
                                val removed = parsePages(pages, source.numberOfPages).toSet()
                                require(removed.size < source.numberOfPages) { "لا يمكن حذف جميع الصفحات" }
                                for (i in source.numberOfPages - 1 downTo 0) {
                                    if (removed.contains(i)) source.removePage(i)
                                }
                                source.save(target)
                            }
                            "reorder" -> PDDocument.load(File(inputs[0])).use { source ->
                                val ordered = parsePages(pages, source.numberOfPages)
                                require(ordered.size == source.numberOfPages && ordered.toSet().size == source.numberOfPages) { "يجب تحديد جميع الصفحات مرة واحدة دون تكرار" }
                                PDDocument().use { output ->
                                    ordered.forEach { i -> output.importPage(source.getPage(i)) }
                                    output.save(target)
                                }
                            }
                            "reverse" -> PDDocument.load(File(inputs[0])).use { source ->
                                PDDocument().use { output ->
                                    for (i in source.numberOfPages - 1 downTo 0) {
                                        output.importPage(source.getPage(i))
                                    }
                                    output.save(target)
                                }
                            }
                            "text" -> PDDocument.load(File(inputs[0])).use { source ->
                                val stripper = PDFTextStripper()
                                val extracted = stripper.getText(source)
                                require(extracted.isNotBlank()) { "لم يتم العثور على نص قابل للاستخراج؛ قد يحتاج الملف إلى OCR" }
                                target.writeText(extracted, StandardCharsets.UTF_8)
                            }
                            "search" -> PDDocument.load(File(inputs[0])).use { source ->
                                require(query.isNotBlank()) { "أدخل كلمة البحث" }
                                val stripper = PDFTextStripper()
                                val matches = mutableListOf<String>()
                                for (p in 1..source.numberOfPages) {
                                    stripper.startPage = p
                                    stripper.endPage = p
                                    val text = stripper.getText(source)
                                    if (text.contains(query, ignoreCase = true)) {
                                        matches.add("الصفحة $p: " + text.replace("\\s+".toRegex(), " ").take(300))
                                    }
                                }
                                target.writeText(if (matches.isEmpty()) "لا توجد نتائج" else matches.joinToString("\n\n"), StandardCharsets.UTF_8)
                            }
                            "imagespdf" -> PDDocument().use { output ->
                                for (file in inputs) {
                                    val bitmap = BitmapFactory.decodeFile(file) ?: error("تعذر قراءة الصورة")
                                    try {
                                        // Fit each image on an A4 page, preserving aspect ratio.
                                        val page = PDPage(PDRectangle.A4)
                                        output.addPage(page)
                                        val img = LosslessFactory.createFromImage(output, bitmap)
                                        val scale = minOf((page.mediaBox.width - 40f) / bitmap.width, (page.mediaBox.height - 40f) / bitmap.height)
                                        val w = bitmap.width * scale
                                        val h = bitmap.height * scale
                                        PDPageContentStream(output, page).use { stream ->
                                            stream.drawImage(img, (page.mediaBox.width - w) / 2f, (page.mediaBox.height - h) / 2f, w, h)
                                        }
                                    } finally { bitmap.recycle() }
                                }
                                output.save(target)
                            }
                            "render" -> PDDocument.load(File(inputs[0])).use { source ->
                                val renderer = PDFRenderer(source)
                                ZipOutputStream(FileOutputStream(target)).use { zip ->
                                    for (i in 0 until source.numberOfPages) {
                                        val bitmap = renderer.renderImageWithDPI(i, 144f)
                                        try {
                                            zip.putNextEntry(ZipEntry("page-${i + 1}.png"))
                                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, zip)
                                            zip.closeEntry()
                                        } finally { bitmap.recycle() }
                                    }
                                }
                            }
                            "blank" -> PDDocument.load(File(inputs[0])).use { source ->
                                // Rendered check detects image-only pages as nonblank; never trust missing text alone.
                                val renderer = PDFRenderer(source)
                                val blank = mutableListOf<Int>()
                                for (i in 0 until source.numberOfPages) {
                                    val bitmap = renderer.renderImageWithDPI(i, 48f)
                                    try {
                                        var colored = false
                                        val step = 3
                                        loop@ for (y in 0 until bitmap.height step step) {
                                            for (x in 0 until bitmap.width step step) {
                                                val c = bitmap.getPixel(x, y)
                                                val r = android.graphics.Color.red(c)
                                                val g = android.graphics.Color.green(c)
                                                val b = android.graphics.Color.blue(c)
                                                if (r < 245 || g < 245 || b < 245) { colored = true; break@loop }
                                            }
                                        }
                                        if (!colored) blank.add(i)
                                    } finally { bitmap.recycle() }
                                }
                                require(blank.size < source.numberOfPages) { "كل الصفحات تبدو فارغة؛ لن يتم حذفها جميعًا" }
                                for (i in blank.asReversed()) source.removePage(i)
                                source.save(target)
                            }
                            "markdown" -> PDDocument.load(File(inputs[0])).use { source ->
                                val stripper = PDFTextStripper()
                                val pages = (1..source.numberOfPages).map { page ->
                                    stripper.startPage = page
                                    stripper.endPage = page
                                    val text = stripper.getText(source).trim()
                                    "## صفحة $page\n\n" + text
                                }
                                require(pages.any { it.substringAfter("\n\n").isNotBlank() }) { "الملف لا يحتوي على نص قابل للاستخراج؛ يلزم OCR" }
                                target.writeText(pages.joinToString("\n\n"), StandardCharsets.UTF_8)
                            }
                            "html" -> PDDocument.load(File(inputs[0])).use { source ->
                                val stripper = PDFTextStripper()
                                var hasExtractableText = false
                                val paragraphs = (1..source.numberOfPages).joinToString("\n") { page ->
                                    stripper.startPage = page
                                    stripper.endPage = page
                                    val text = stripper.getText(source).trim()
                                    if (text.isNotBlank()) hasExtractableText = true
                                    "<section><h2>صفحة $page</h2><p>" + htmlEscape(text).replace("\n", "<br>") + "</p></section>"
                                }
                                require(hasExtractableText) { "الملف لا يحتوي على نص قابل للاستخراج" }
                                target.writeText("<!doctype html><html lang=\"ar\"><head><meta charset=\"utf-8\"><title>PDF Export</title></head><body>" + paragraphs + "</body></html>", StandardCharsets.UTF_8)
                            }
                            "docx" -> PDDocument.load(File(inputs[0])).use { source ->
                                val stripper = PDFTextStripper()
                                val text = stripper.getText(source)
                                require(text.isNotBlank()) { "الملف لا يحتوي على نص قابل للاستخراج؛ يلزم OCR" }
                                val paras = text.lines().filter { it.isNotBlank() }.joinToString("") { line ->
                                    "<w:p><w:r><w:t xml:space=\"preserve\">" + htmlEscape(line) + "</w:t></w:r></w:p>"
                                }
                                ZipOutputStream(FileOutputStream(target)).use { zip ->
                                    fun entry(name: String, content: String) {
                                        zip.putNextEntry(ZipEntry(name))
                                        zip.write(content.toByteArray(StandardCharsets.UTF_8))
                                        zip.closeEntry()
                                    }
                                    entry("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>")
                                    entry("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>")
                                    entry("word/document.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" + paras + "<w:sectPr/></w:body></w:document>")
                                }
                            }
                            "compare" -> {
                                require(inputs.size == 2) { "اختر ملفي PDF للمقارنة" }
                                val texts = inputs.map { file -> PDDocument.load(File(file)).use { PDFTextStripper().getText(it) } }
                                val a = texts[0].lines()
                                val b = texts[1].lines()
                                val differences = (0 until maxOf(a.size, b.size)).mapNotNull { i ->
                                    val left = a.getOrNull(i).orEmpty()
                                    val right = b.getOrNull(i).orEmpty()
                                    if (left == right) null else "السطر ${i + 1}\nالأول: $left\nالثاني: $right"
                                }
                                target.writeText(if (differences.isEmpty()) "لا توجد اختلافات نصية" else differences.joinToString("\n\n"), StandardCharsets.UTF_8)
                            }
                            "chapters" -> PDDocument.load(File(inputs[0])).use { source ->
                                val extractor = PDFTextStripper()
                                val heading = Regex("^(?:الفصل|الباب|الوحدة|القسم|الدرس|chapter|section|part|unit)\\b", RegexOption.IGNORE_CASE)
                                val rows = mutableListOf("page,title")
                                for (i in 1..source.numberOfPages) {
                                    extractor.startPage = i
                                    extractor.endPage = i
                                    extractor.getText(source).lines().map { it.trim() }.filter { it.length in 3..160 && heading.containsMatchIn(it) }.forEach { line ->
                                        rows.add("$i," + csv(line))
                                    }
                                }
                                target.writeText(rows.joinToString("\n"), StandardCharsets.UTF_8)
                            }
                            "tables" -> PDDocument.load(File(inputs[0])).use { source ->
                                val text = PDFTextStripper().getText(source)
                                val rows = text.lines().map { it.trim() }.filter { it.contains(Regex("\\s{2,}|\t")) }.map { line ->
                                    line.split(Regex("\\s{2,}|\t")).joinToString(",") { csv(it) }
                                }
                                require(rows.isNotEmpty()) { "لا توجد صفوف قابلة للتقسيم؛ يلزم استخراج جداول متقدم أو OCR" }
                                target.writeText(rows.joinToString("\n"), StandardCharsets.UTF_8)
                            }
                            "xlsx" -> PDDocument.load(File(inputs[0])).use { source ->
                                val text = PDFTextStripper().getText(source)
                                val parsed = text.lines().map { it.trim() }
                                    .filter { it.contains(Regex("\\s{2,}|\\t")) }
                                    .map { it.split(Regex("\\s{2,}|\\t")) }
                                require(parsed.isNotEmpty()) { "لم يتم اكتشاف صفوف قابلة للتقسيم؛ هذا المحول تجريبي" }
                                val xml = buildString {
                                    append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
                                    append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>")
                                    parsed.forEachIndexed { index, cells ->
                                        append("<row r=\"${index + 1}\">")
                                        cells.forEach { cell ->
                                            append("<c t=\"inlineStr\"><is><t>")
                                            append(htmlEscape(cell))
                                            append("</t></is></c>")
                                        }
                                        append("</row>")
                                    }
                                    append("</sheetData></worksheet>")
                                }
                                ZipOutputStream(FileOutputStream(target)).use { zip ->
                                    fun entry(name: String, content: String) {
                                        zip.putNextEntry(ZipEntry(name))
                                        zip.write(content.toByteArray(StandardCharsets.UTF_8))
                                        zip.closeEntry()
                                    }
                                    entry("[Content_Types].xml", "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>")
                                    entry("_rels/.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>")
                                    entry("xl/workbook.xml", "<?xml version=\"1.0\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Export\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>")
                                    entry("xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>")
                                    entry("xl/worksheets/sheet1.xml", xml)
                                }
                            }
                            "batch" -> {
                                require(inputs.isNotEmpty()) { "اختر ملف PDF واحدًا على الأقل" }
                                ZipOutputStream(FileOutputStream(target)).use { zip ->
                                    inputs.forEachIndexed { index, path ->
                                        val text = PDDocument.load(File(path)).use { PDFTextStripper().getText(it) }
                                        val entry = ZipEntry("document-${index + 1}.txt")
                                        zip.putNextEntry(entry)
                                        zip.write(text.toByteArray(StandardCharsets.UTF_8))
                                        zip.closeEntry()
                                    }
                                }
                            }
                            "batchmerge" -> {
                                require(inputs.size >= 2) { "اختر ملفين على الأقل" }
                                val merger = PDFMergerUtility()
                                inputs.forEach { merger.addSource(File(it)) }
                                merger.destinationFileName = dest
                                merger.mergeDocuments(null)
                            }
                            "chapterpdf" -> PDDocument.load(File(inputs[0])).use { source ->
                                val extractor = PDFTextStripper()
                                val heading = Regex("^(الفصل|الباب|الوحدة|القسم|الدرس|chapter|section|part|unit)(\\s|[:：]|$)", RegexOption.IGNORE_CASE)
                                val starts = mutableListOf(0)
                                for (i in 0 until source.numberOfPages) {
                                    extractor.startPage = i + 1
                                    extractor.endPage = i + 1
                                    val lines = extractor.getText(source).lines().take(20).map { it.trim() }
                                    if (i > 0 && lines.any { it.length in 3..120 && heading.containsMatchIn(it) }) starts.add(i)
                                }
                                val boundaries = starts.distinct().sorted() + source.numberOfPages
                                ZipOutputStream(FileOutputStream(target)).use { zip ->
                                    for (part in 0 until boundaries.size - 1) {
                                        PDDocument().use { section ->
                                            for (i in boundaries[part] until boundaries[part + 1]) section.importPage(source.getPage(i))
                                            val buffer = java.io.ByteArrayOutputStream()
                                            section.save(buffer)
                                            zip.putNextEntry(ZipEntry("chapter-${part + 1}.pdf"))
                                            zip.write(buffer.toByteArray())
                                            zip.closeEntry()
                                        }
                                    }
                                }
                            }
                            "number" -> PDDocument.load(File(inputs[0])).use { source ->
                                source.pages.forEachIndexed { i, page ->
                                    PDPageContentStream(source, page, AppendMode.APPEND, true, true).use { stream ->
                                        stream.beginText()
                                        stream.setFont(PDType1Font.HELVETICA, 12f)
                                        stream.newLineAtOffset(page.mediaBox.width / 2f, 20f)
                                        stream.showText((i + 1).toString())
                                        stream.endText()
                                    }
                                }
                                source.save(target)
                            }
                            "watermark" -> PDDocument.load(File(inputs[0])).use { source ->
                                require(query.isNotBlank()) { "أدخل نص العلامة المائية" }
                                source.pages.forEach { page ->
                                    val w = 1200
                                    val h = 200
                                    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                                    try {
                                        val canvas = Canvas(bitmap)
                                        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                                            color = Color.argb(75, 55, 75, 110)
                                            textSize = 68f
                                            textAlign = Paint.Align.CENTER
                                            typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
                                        }
                                        val value = query.take(65)
                                        canvas.drawText(value, w / 2f, h / 2f - (paint.ascent() + paint.descent()) / 2f, paint)
                                        val image = LosslessFactory.createFromImage(source, bitmap)
                                        val width = page.mediaBox.width * 0.78f
                                        val height = width * h / w
                                        PDPageContentStream(source, page, AppendMode.APPEND, true, true).use { stream ->
                                            stream.drawImage(image, page.mediaBox.lowerLeftX + (page.mediaBox.width-width)/2f, page.mediaBox.lowerLeftY+(page.mediaBox.height-height)/2f, width, height)
                                        }
                                    } finally { bitmap.recycle() }
                                }
                                source.save(target)
                            }
                            "rotate" -> PDDocument.load(File(inputs[0])).use { source ->
                                require(degrees in listOf(90,180,270)) { "زاوية التدوير غير صحيحة" }
                                source.pages.forEach { page -> page.rotation = (page.rotation + degrees) % 360 }
                                source.save(target)
                            }
                            else -> error("وظيفة غير مدعومة")
                        }
                        runOnUiThread { result.success(dest) }
                    } catch (e: Exception) {
                        runOnUiThread { result.error("PDF_ERROR", e.message ?: "خطأ في معالجة PDF", null) }
                    }
                }.start()
            }
    }

    private fun csv(s: String): String = "\"" + s.replace("\"", "\"\"") + "\""

    private fun htmlEscape(value: String): String = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;")

    private fun parsePages(text: String, total: Int): List<Int> {
        val pages = linkedSetOf<Int>()
        text.split(",").forEach { raw ->
            val item = raw.trim()
            if (item.contains("-")) {
                val ends = item.split("-").map { it.trim().toInt() }
                require(ends.size == 2) { "نطاق الصفحات غير صحيح" }
                for (p in minOf(ends[0], ends[1])..maxOf(ends[0], ends[1])) {
                    require(p in 1..total) { "رقم الصفحة خارج الملف" }
                    pages.add(p - 1)
                }
            } else if (item.isNotBlank()) {
                val p = item.toInt()
                require(p in 1..total) { "رقم الصفحة خارج الملف" }
                pages.add(p - 1)
            }
        }
        require(pages.isNotEmpty()) { "اختر صفحة واحدة على الأقل" }
        return pages.toList()
    }
}
