import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:open_filex/open_filex.dart';

void main() => runApp(const PdfStudioApp());
const channel = MethodChannel('com.explapp.pdfstudio/native_pdf');

class PdfStudioApp extends StatelessWidget {
  const PdfStudioApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'ExplApp PDF Studio',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff2859d8)), useMaterial3: true),
    home: const Directionality(textDirection: TextDirection.rtl, child: StudioHome()),
  );
}

class StudioHome extends StatefulWidget {
  const StudioHome({super.key});
  @override
  State<StudioHome> createState() => _StudioHomeState();
}

class _StudioHomeState extends State<StudioHome> {
  final List<String> files = [];
  String mode = 'merge';
  bool busy = false;
  String? result;
  String? error;
  final pages = TextEditingController(text: '1');
  final rotation = TextEditingController(text: '90');

  @override
  void dispose() {pages.dispose(); rotation.dispose(); super.dispose();}

  Future<void> pick() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom, allowedExtensions: ['pdf'],
      allowMultiple: mode == 'merge', withData: false,
    );
    if (picked == null) return;
    final paths = picked.files.map((f) => f.path).whereType<String>().toList();
    setState(() {files..clear()..addAll(paths); result = null; error = null;});
  }

  Future<void> execute() async {
    if (files.isEmpty) {setState(()=>error='اختر ملف PDF أولًا');return;}
    if (mode == 'merge' && files.length < 2) {setState(()=>error='اختر ملفين على الأقل للدمج');return;}
    setState(() {busy = true; result = null; error = null;});
    try {
      final folder = await getApplicationDocumentsDirectory();
      final extension = mode == 'text' ? 'txt' : 'pdf';
      final name = 'ExplApp-${mode}-${DateTime.now().millisecondsSinceEpoch}.$extension';
      final path = '${folder.path}/$name';
      await channel.invokeMethod<void>('process', {
        'operation': mode, 'inputs': files, 'output': path,
        'pages': pages.text, 'degrees': int.tryParse(rotation.text) ?? 90,
      });
      if (!await File(path).exists()) throw Exception('لم ينتج الملف المتوقع');
      setState(()=>result=path);
    } on PlatformException catch (e) {
      setState(()=>error=e.message??'تعذر تنفيذ العملية');
    } catch (e) {
      setState(()=>error=e.toString());
    } finally {if(mounted)setState(()=>busy=false);}
  }

  @override
  Widget build(BuildContext context) {
    final actions = <(String,String,IconData)>[
      ('merge','دمج ملفات PDF',Icons.layers),
      ('split','استخراج صفحات',Icons.content_cut),
      ('rotate','تدوير الصفحات',Icons.rotate_right),
      ('delete','حذف صفحات محددة',Icons.delete_outline),
      ('reverse','عكس ترتيب الصفحات',Icons.swap_vert),
      ('text','استخراج النص إلى TXT',Icons.text_snippet_outlined),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('ExplApp PDF Studio'),centerTitle:true),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16),children: [
        Container(padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color:const Color(0xff2859d8),borderRadius:BorderRadius.circular(22)),
          child: const Column(crossAxisAlignment: CrossAxisAlignment.start,children:[
            Text('أدوات PDF أصلية',style:TextStyle(color:Colors.white,fontSize:23,fontWeight:FontWeight.bold)),
            SizedBox(height:8),
            Text('معالجة محلية على الهاتف، بلا متصفح أو رفع الملفات إلى خادم.',style:TextStyle(color:Colors.white)),
          ])),
        const SizedBox(height:20),
        Text('اختر الوظيفة',style:Theme.of(context).textTheme.titleLarge),
        const SizedBox(height:8),
        ...actions.map((a)=>Card(child:RadioListTile<String>(
          title:Text(a.$2),secondary:Icon(a.$3),value:a.$1,groupValue:mode,
          onChanged:(v)=>setState(() {mode=v!;files.clear();result=null;error=null;}),
        ))),
        const SizedBox(height:12),
        FilledButton.icon(onPressed:busy?null:pick,icon:const Icon(Icons.folder_open),label:Text(mode=='merge'?'اختيار ملفات PDF':'اختيار ملف PDF')),
        ...files.map((f)=>ListTile(dense:true,leading:const Icon(Icons.picture_as_pdf),title:Text(f.split('/').last,maxLines:1,overflow:TextOverflow.ellipsis))),
        if (mode=='split' || mode=='delete') TextField(controller:pages,decoration:InputDecoration(labelText:mode=='delete'?'الصفحات المراد حذفها':'الصفحات المراد استخراجها',helperText:'مثال: 1-3,5'),keyboardType:TextInputType.text),
        if (mode=='rotate') DropdownButtonFormField<String>(
          value: rotation.text,items:['90','180','270'].map((d)=>DropdownMenuItem(value:d,child:Text('$d درجة'))).toList(),
          onChanged:(v)=>setState(()=>rotation.text=v??'90'),decoration:const InputDecoration(labelText:'زاوية التدوير'),
        ),
        const SizedBox(height:14),
        FilledButton.icon(onPressed:busy?null:execute,icon:const Icon(Icons.play_arrow),label:Text(busy?'جار المعالجة...':'تنفيذ العملية')),
        if (busy) const LinearProgressIndicator(),
        if (error!=null) Padding(padding:const EdgeInsets.only(top:14),child:Text(error!,style:const TextStyle(color:Colors.red))),
        if (result!=null) Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(children:[
          const Text('تم إنشاء الملف محليًا',style:TextStyle(fontWeight:FontWeight.bold)),
          Text(result!.split('/').last),
          Wrap(spacing:8,children:[
            TextButton.icon(onPressed:()=>OpenFilex.open(result!),icon:const Icon(Icons.open_in_new),label:const Text('فتح')),
            TextButton.icon(onPressed:()=>Share.shareXFiles([XFile(result!)]),icon:const Icon(Icons.share),label:const Text('حفظ / مشاركة')),
          ])
        ]))),
      ])),
    );
  }
}
