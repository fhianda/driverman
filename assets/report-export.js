'use strict';

const ReportExports = (() => {
  const metrics=typeof module!=='undefined'&&module.exports?require('./report-metrics.js'):ReportMetrics;
  const numeric=(value,digits=0)=>new Intl.NumberFormat('fr-FR',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value).replace(/[\u202f\u00a0]/g,' ');
  const displayDate=value=>value?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)} ${value.slice(11,16)}`:'—';
  const display=(value,column)=>value===null||value===undefined?'—':column.type==='number'?numeric(value,column.digits):column.type==='date'?displayDate(value):String(value);
  function indicators(report) {
    const t=report.totals, rows=[];
    if(report.filters.type!=='fuel') rows.push(['Courses',t.courses,'départs'],['Courses terminées',t.completed,'courses'],['Courses en cours',t.active,'courses'],['Distance des courses terminées',t.distance,'km']);
    if(report.filters.type!=='courses') rows.push(['Ravitaillements',t.refuels,'ajouts'],['Carburant ajouté',t.liters,'L'],['Dépenses en USD',t.USD,'USD'],['Dépenses en CDF',t.CDF,'CDF'],['Consommation estimée',t.consumed,'L'],['Consommation moyenne',t.rate,'L/100 km']);
    return rows.map(([label,value,unit])=>[label,value,value===1?({départs:'départ',courses:'course',ajouts:'ajout'}[unit]||unit):unit]);
  }
  function filename(report,extension) {return `DriverMan-${report.filters.type}-${report.filters.from}_${report.filters.to}${report.filters.vehicleId==='all'?'':`-vehicule-${report.filters.vehicleId}`}.${extension}`;}
  async function excel(report,ExcelJS) {
    const book=new ExcelJS.Workbook();
    book.creator='DriverMan TELESOL';book.title=report.title;book.subject=`${report.filters.from} à ${report.filters.to} · ${report.vehicleLabel}`;
    const dark='FF1B212C',orange='FFDA6C35';
    function header(sheet,values,rowNumber) {
      const row=sheet.getRow(rowNumber);row.values=values;row.height=34;
      row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:dark}};cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',wrapText:true};});
    }
    function base(name,widths) {
      const sheet=book.addWorksheet(name,{properties:{defaultRowHeight:22},pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0},views:[{state:'frozen',ySplit:6}]});
      sheet.columns=widths.map(width=>({width}));
      for(const [index,text] of [report.title,`${report.filters.from} à ${report.filters.to} · ${report.vehicleLabel}`,`Généré le ${displayDate(report.generatedAt)} · ${report.timezone}${report.demo?' · DÉMONSTRATION':''}`].entries()) {
        sheet.mergeCells(index+1,1,index+1,widths.length);const cell=sheet.getCell(index+1,1);cell.value=text;cell.font={name:'Calibri',size:index===0?18:11,bold:index===0,color:{argb:index===0?orange:dark}};cell.alignment={wrapText:true,vertical:'middle'};sheet.getRow(index+1).height=index===0?34:28;
      }
      sheet.headerFooter.oddFooter='DriverMan TELESOL &RPage &P / &N';
      sheet.pageSetup.printTitlesRow='1:6';
      return sheet;
    }
    const summary=base('Synthèse',[45,22,24]);
    header(summary,['Indicateur','Valeur','Unité'],6);
    for(const [label,value,unit] of indicators(report)) {
      const row=summary.addRow([label,value===null?'Indéterminée':value,unit]);
      row.getCell(2).numFmt=['USD','CDF','L/100 km'].includes(unit)?'#,##0.00':unit==='L'?'#,##0.000':'#,##0';
    }
    summary.addRow([]);
    for(const note of metrics.notes(report)) {const row=summary.addRow([note]);summary.mergeCells(row.number,1,row.number,3);row.height=Math.max(36,Math.ceil(note.length/110)*16);row.getCell(1).alignment={wrapText:true,vertical:'top'};row.getCell(1).font={name:'Calibri',size:10,color:{argb:'FF505B6C'}};}
    for(const table of metrics.tables(report)) {
      const sheet=base(table.name,table.columns.map(c=>c.type==='date'?23:c.type==='number'?19:c.label==='Destination'||c.label==='Motif'?32:26));
      sheet.getCell('A5').value=table.title;sheet.getCell('A5').font={bold:true,size:12};
      header(sheet,table.columns.map(c=>c.label),6);
      table.rows.forEach((values,index)=>{
        const row=sheet.addRow(values.map((v,i)=>v==null?null:table.columns[i].type==='date'?new Date(v.replace(' ','T')+'Z'):v));
        // Les chaînes restent des chaînes XLSX, y compris celles commençant par = ou +.
        row.height=Math.max(24,...values.map((v,i)=>table.columns[i].type==='text'?Math.ceil(String(v??'').length/(sheet.getColumn(i+1).width-2))*15:24));
        row.eachCell({includeEmpty:true},(cell,col)=>{
          const c=table.columns[col-1];cell.font={name:'Calibri',size:11};cell.alignment={vertical:'top',wrapText:true};
          if(index%2===0) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F4F8'}};
          if(c.type==='number') cell.numFmt=c.digits?'#,##0.'+'0'.repeat(c.digits):'#,##0';
          if(c.type==='date') cell.numFmt='dd/mm/yyyy hh:mm';
        });
      });
      if(table.rows.length) sheet.autoFilter={from:{row:6,column:1},to:{row:6+table.rows.length,column:table.columns.length}};
      else {sheet.mergeCells(7,1,7,table.columns.length);sheet.getCell('A7').value='Aucun enregistrement sur cette période.';}
    }
    return book.xlsx.writeBuffer();
  }
  function pdf(report,{jsPDF,autoTable,fontRegular,fontBold}) {
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    doc.addFileToVFS('Manrope-Regular.ttf',fontRegular);doc.addFont('Manrope-Regular.ttf','Manrope','normal');
    doc.addFileToVFS('Manrope-Bold.ttf',fontBold);doc.addFont('Manrope-Bold.ttf','Manrope','bold');
    doc.setFont('Manrope');doc.setProperties({title:report.title,author:'DriverMan TELESOL',subject:`${report.filters.from} à ${report.filters.to} · ${report.vehicleLabel}`});
    const width=297,height=210,margin=14;
    function title(text,y=46){doc.setFont('Manrope','bold');doc.setFontSize(12);doc.setTextColor(35,42,53);doc.text(text,margin,y);doc.setFont('Manrope','normal');}
    const options={theme:'striped',margin:{left:margin,right:margin,top:42,bottom:18},styles:{font:'Manrope',fontSize:9,cellPadding:2.5,overflow:'linebreak',textColor:[35,42,53]},headStyles:{fillColor:[35,42,53],textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[244,246,249]},rowPageBreak:'avoid',showHead:'everyPage'};
    title('Synthèse');
    autoTable(doc,{...options,startY:51,head:[['Indicateur','Valeur','Unité']],body:indicators(report).map(([label,value,unit])=>[label,value===null?'Indéterminée':numeric(value,['USD','CDF','L/100 km'].includes(unit)?2:unit==='L'?3:0),unit]),columnStyles:{1:{halign:'right',cellWidth:50},2:{cellWidth:45}}});
    let y=doc.lastAutoTable.finalY+10;
    doc.setFontSize(8.5);
    for(const note of metrics.notes(report)) {
      const lines=doc.splitTextToSize(note,width-margin*2);
      if(y+lines.length*4>height-20){doc.addPage();y=46;}
      doc.text(lines,margin,y);y+=lines.length*4+4;
    }
    for(const table of metrics.tables(report)) {
      doc.addPage();title(table.title);
      if(!table.rows.length){doc.setFontSize(10);doc.text('Aucun enregistrement sur cette période.',margin,58);continue;}
      autoTable(doc,{...options,startY:51,head:[table.columns.map(c=>c.label)],body:table.rows.map(row=>row.map((v,i)=>display(v,table.columns[i]))),columnStyles:Object.fromEntries(table.columns.map((c,i)=>[i,c.type==='number'?{halign:'right'}:{}]))});
    }
    const count=doc.getNumberOfPages();
    for(let page=1;page<=count;page++) {
      doc.setPage(page);doc.setFillColor(27,33,44);doc.rect(0,0,width,32,'F');doc.setTextColor(255,255,255);doc.setFont('Manrope','bold');doc.setFontSize(18);doc.text('DriverMan TELESOL',margin,12);
      doc.setFont('Manrope','normal');doc.setFontSize(10);doc.text(`${report.title} · ${report.filters.from} à ${report.filters.to} · ${report.vehicleLabel}`,margin,20);
      doc.setFontSize(8);doc.text(`Généré le ${displayDate(report.generatedAt)} · ${report.timezone}${report.demo?' · DONNÉES DE DÉMONSTRATION':''}`,margin,27);
      doc.setDrawColor(220,225,230);doc.line(margin,height-14,width-margin,height-14);doc.setTextColor(92,101,114);doc.text('DriverMan TELESOL · Gestion de parc',margin,height-8);doc.text(`Page ${page} / ${count}`,width-margin,height-8,{align:'right'});
    }
    return doc.output('arraybuffer');
  }
  return {excel,pdf,indicators,filename,display};
})();
if(typeof module!=='undefined'&&module.exports) module.exports=ReportExports;
