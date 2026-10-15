import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:explapp_pdf_studio/main.dart';

void main() {
  testWidgets('Native PDF Studio renders tool choices', (tester) async {
    await tester.pumpWidget(const PdfStudioApp());
    expect(find.text('ExplApp PDF Studio'), findsOneWidget);
    expect(find.text('أدوات PDF أصلية'), findsOneWidget);
    expect(find.text('دمج ملفات PDF'), findsOneWidget);
    expect(find.byType(FilledButton), findsWidgets);
  });
}
