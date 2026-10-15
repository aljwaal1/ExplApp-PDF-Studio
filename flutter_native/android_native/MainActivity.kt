package com.explapp.explapp_pdf_studio

import android.os.Bundle
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageTree
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

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
