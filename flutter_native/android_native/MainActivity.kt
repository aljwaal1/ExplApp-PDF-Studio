package com.explapp.explapp_pdf_studio

import android.os.Bundle
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

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PDFBoxResourceLoader.init(applicationContext)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.explapp.pdfstudio/native_pdf")
            .setMethodCallHandler { call, result ->
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
                                target.writeText(if (matches.isEmpty()) "لا توجد نتائج" else matches.joinToString("\\n\\n"), StandardCharsets.UTF_8)
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
