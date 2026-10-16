import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:explapp_pdf_studio/main.dart';

void main() {
  testWidgets('Native PDF Studio renders tool choices', (tester) async {
    await tester.pumpWidget(const PdfStudioApp());
    expect(find.text('ExplApp PDF Studio'), findsOneWidget);
    expect(find.text('أدوات PDF أصلية'), findsOneWidget);
    expect(find.text('دمج ملفات PDF'), findsOneWidget);
    expect(find.text('حذف صفحات محددة'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('بحث نصي داخل PDF'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('بحث نصي داخل PDF'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('حذف الصفحات البيضاء'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('حذف الصفحات البيضاء'), findsOneWidget);
    for (final label in ['PDF إلى Markdown', 'PDF إلى HTML', 'PDF إلى Word DOCX']) {
      await tester.scrollUntilVisible(find.text(label), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text(label), findsOneWidget);
    }
    for (final label in ['مقارنة نصية لملفين', 'فهرسة عناوين الفصول CSV', 'استخراج صفوف CSV مبدئي', 'استخراج نصوص جماعي ZIP']) {
      await tester.scrollUntilVisible(find.text(label), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text(label), findsOneWidget);
    }
    for (final label in ['تقسيم فصول الكتاب PDF ZIP', 'دمج جماعي لملفات PDF']) {
      await tester.scrollUntilVisible(find.text(label), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text(label), findsOneWidget);
    }
    expect(find.byType(ListView), findsOneWidget);
  });
}
