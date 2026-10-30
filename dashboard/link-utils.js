(function(root){
  function extract(value){
    const found=[];
    function visit(v){
      if(Array.isArray(v)){v.forEach(visit);return;}
      if(v&&typeof v==='object'){for(const key of ['link','url','href','text','value'])if(v[key]!=null)visit(v[key]);return;}
      if(typeof v!=='string')return;
      for(const match of v.matchAll(/https?:\/\/[^\s<>"'\[\]（）()【】]+/gi)){
        const url=match[0].replace(/[，。；、！？,;.!?]+$/g,'');
        try{const parsed=new URL(url);if(['http:','https:'].includes(parsed.protocol)&&!found.includes(parsed.href))found.push(parsed.href);}catch(_){}
      }
    }
    visit(value);return found;
  }
  if(typeof module!=='undefined')module.exports={extract};else root.LinkUtils={extract};
})(globalThis);
