// Renders the annotated HTTP exchanges for the MCP authorization post.
// The trace itself lives in trace.json; the mcp-trace shortcode inlines it as #trace-data.
"use strict";
(() => {
  const source = document.getElementById("trace-data");
  if (!source) return;
  const data = JSON.parse(source.textContent);
  const $ = id => document.getElementById(id);
  const el = (tag,className="",text) => {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(text!==undefined) node.textContent=text;
    return node;
  };
  function references(keys) {
    const list=el("div","references");
    [...new Set(keys)].forEach(key => {
      const ref=data.references[key], row=el("div","reference"), link=el("a","",ref.label);
      link.href=ref.url; link.target="_blank"; link.rel="noopener noreferrer";
      row.append(link,el("span","",ref.description)); list.append(row);
    });
    return list;
  }
  function noteFor(key,value,path) {
    const lower=key.toLowerCase(), schema=/inputSchema|outputSchema/.test(path);
    if(path.endsWith(".capabilities.tools")) return data.fieldNotes["tools.capability"];
    if(path==="body.result.tools") return data.fieldNotes["tools.list"];
    if(/\.tools\[\d+\]$/.test(path)) return data.fieldNotes.tool;
    if(schema && data.fieldNotes["schema."+lower]) return data.fieldNotes["schema."+lower];
    if(schema && /\.properties\.[^.]+$/.test(path)) return {
      what:"The tool argument named "+key+".",
      why:"Copilot supplies this property when it calls the tool.",
      values:value.type ? "Must satisfy the "+JSON.stringify(value.type)+" schema and its constraints." : "Must satisfy this subschema.",
      refs:["mcp-schema","mcp-tools"]
    };
    if(/^\[\d+\]$/.test(key)) {
      const parent=path.replace(/\[\d+\]$/,"").split(".").pop().toLowerCase();
      return data.fieldNotes["schema."+parent] || data.fieldNotes[parent];
    }
    return data.fieldNotes[lower];
  }
  function appendField(container,key,value,path,depth=0) {
    const nested=value!==null && typeof value==="object";
    const row=el("div","field-row"+(nested?" object":"")), wire=el("div","wire-field");
    row.dataset.path=path;
    wire.style.setProperty("--indent",Math.min(depth,3)*8+"px");
    const preview=nested ? (Array.isArray(value) ? "["+value.length+" items]" : "{"+Object.keys(value).length+" fields}") :
      typeof value==="string" ? value : JSON.stringify(value);
    wire.append(el("span","field-key",key),el("span","field-value",preview));
    const note=noteFor(key,value,path), aside=el("aside","annotation");
    if(note) {
      aside.append(el("p","",note.what+" "+note.why));
      const values=el("p","values");
      values.append(el("strong","","Values: "),document.createTextNode(note.values));
      aside.append(values,references(note.refs));
    }
    row.append(wire,aside);container.append(row);
    if(nested) Object.entries(value).forEach(([name,item]) => {
      const child=Array.isArray(value)?"["+name+"]":name;
      appendField(container,child,item,path+(Array.isArray(value)?child:"."+name),depth+1);
    });
  }
  function section(pane,title,entries,path) {
    if(!entries.length) return;
    pane.append(el("div","section-label",title));
    const fields=el("div","fields");
    entries.forEach(([key,value]) => appendField(fields,key,value,path+"."+key));
    pane.append(fields);
  }
  function protocolNote(pane,text,refs) {
    const note=el("div","protocol-note");
    note.append(el("p","",text),references(refs));pane.append(note);
    return note;
  }
  function discoveryOrder(pane) {
    const note=el("div","protocol-note discovery-note");
    note.append(el("p","","MCP mandates this priority order when the issuer URL has a path component, as Entra's tenant/v2.0 issuer does:"));
    const table=el("table","discovery-order"), head=el("thead"), row=el("tr");
    ["Try","Metadata URL","Result here"].forEach(text=>row.append(el("th","",text)));
    head.append(row);table.append(head);
    const body=el("tbody");
    ["oauth-metadata","oidc-insertion","oidc"].forEach((kind,index)=>{
      const exchange=data.exchanges.find(item=>item.kind===kind), tr=el("tr"), url=el("td");
      url.append(el("code","",exchange.request.url));
      tr.append(el("td","",String(index+1)),url,el("td","",String(exchange.response.status)));body.append(tr);
    });
    table.append(body);note.append(table);
    note.append(el("p","","Copilot stops after obtaining and validating usable metadata, including an exact issuer match. For this issuer, the specification defines no fourth well-known candidate."));
    const simple=el("p");
    simple.append(document.createTextNode("For an issuer with no path, the order is just "),
      el("code","","/.well-known/oauth-authorization-server"),document.createTextNode(" followed by "),
      el("code","","/.well-known/openid-configuration"),document.createTextNode(". There is no extra root or /common fallback for the path-bearing issuer above."));
    note.append(simple,references(["mcp-discovery-order","8414-3.1","oidc-4"]));pane.append(note);
  }
  function navigationBody(content,navigation) {
    content.append(el("div","section-label","HTML body · navigation script"));
    const row=el("div","field-row"), wire=el("div","wire-field");
    row.dataset.path="html.navigation";
    const script="<"+"script>\n  "+navigation.method+"(\n    "+JSON.stringify(navigation.url)+"\n  );\n<"+"/script>";
    wire.append(el("pre","script-example",script));
    const note=el("aside","annotation");
    note.append(el("p","","Entra sends the authorization code inside the callback URL in this HTML. The browser executes document.location.replace and navigates to that URL, creating the GET request to Copilot in exchange 07."));
    note.append(el("p","","This is JavaScript-driven redirection: the response is HTTP 200, with no Location header. The script transports the code Entra issued; it does not create a new code or redeem it."));
    note.append(references(["6749-1.7","6749-4.1.2","html-location-replace"]));
    row.append(wire,note);content.append(row);
    section(content,"Callback URL parameters in the script",[...new URL(navigation.url).searchParams],"html.callback");
  }
  function makePane(exchange,index,view) {
    const request=view==="request", message=exchange[view], pane=el("section","pane");
    pane.id="message-"+index+"-"+view;
    pane.setAttribute("role","tabpanel");pane.setAttribute("aria-labelledby","tab-"+index+"-"+view);
    const toolbar=el("div","message-toolbar"), button=el("button","btn message-explain","Explain "+view);
    const content=el("div","message-content");content.id=pane.id+"-fields";
    button.type="button";button.setAttribute("aria-expanded","false");button.setAttribute("aria-controls",content.id);
    button.addEventListener("click",() => {
      const expanded=pane.classList.toggle("explaining");
      button.setAttribute("aria-expanded",String(expanded));
      button.textContent=expanded?"Hide explanations":"Explain "+view;
    });
    toolbar.append(el("span","message-direction",request?exchange.sender+" → "+exchange.receiver:exchange.receiver+" → "+exchange.sender),button);
    pane.append(toolbar,content);
    const url=new URL(exchange.request.url), authority=url.host, protocol=message.httpVersion || "HTTP";
    const line=request?message.method+" "+url.pathname+" "+protocol:protocol+" "+message.status+(message.reason?" "+message.reason:"");
    content.append(el("div","start-line mono",line));
    if(request) {
      section(content,"Destination",[["host",authority]],"destination");
      section(content,"Query parameters",[...url.searchParams],"query");
    }
    section(content,"Headers",message.headers,"headers");
    const challenge=message.headers.find(([key])=>key.toLowerCase()==="www-authenticate")?.[1];
    if(challenge) {
      const fields=[...challenge.matchAll(/([A-Za-z_][\w-]*)="((?:\\.|[^"\\])*)"/g)].map(m=>[m[1],m[2]]);
      section(content,"Authentication challenge parameters",fields,"challenge");
    }
    if(message.navigation) {
      navigationBody(content,message.navigation);
    } else if(message.sse) {
      message.sse.forEach(event => section(content,"SSE data · JSON-RPC response",Object.entries(event.message),"body"));
    } else if(message.body!==undefined && message.body!==null && message.body!=="") {
      const form=message.headers.some(([key,value])=>key.toLowerCase()==="content-type" && value.includes("x-www-form-urlencoded"));
      section(content,form?"Form body":"JSON body",Object.entries(message.body),"body");
    }
    if(request && ["authorize","token"].includes(exchange.kind) &&
       !(new URL(message.url).searchParams.has("resource") || message.body?.resource)) {
      protocolNote(content,"MCP requires a resource parameter on authorization and token requests to identify the intended MCP server. It is absent in this exchange; a scope containing the server URL is not a substitute.",["mcp-resource"]);
    }
    if(!request && exchange.kind==="oidc" && !message.body.code_challenge_methods_supported) {
      protocolNote(content,"The MCP authorization specification requires advertised PKCE support through code_challenge_methods_supported, normally including S256. This Entra metadata response does not advertise that field.",["mcp-pkce"]);
    }
    if(["oauth-metadata","oidc-insertion","oidc"].includes(exchange.kind)) discoveryOrder(content);
    if(!request && exchange.kind==="callback") {
      const note=protocolNote(content,"The code is not returned in this HTTP 200 response. The browser already delivered Entra's code to Copilot in the GET query of this exchange's request; this response travels from Copilot back to the browser.",["6749-4.1.2","8252-7.3"]);
      const link=el("a","","View code in the callback request");link.href="#tab-"+index+"-request";
      link.addEventListener("click",event=>{
        event.preventDefault();const tab=$("tab-"+index+"-request");tab.click();tab.focus();
      });
      note.append(link);
    }
    if(!request && exchange.kind==="accepted") {
      protocolNote(content,"server/discover returns supportedVersions, capabilities, and server identity. capabilities.tools={} means tool support is advertised; it is not an empty tool list. Actual tool definitions are returned by tools/list in exchange 10. These message shapes are defined by MCP, not by the OAuth RFCs.",["mcp-discover","mcp-tools"]);
    }
    return pane;
  }
  const cards=[];
  data.exchanges.forEach((exchange,index) => {
    const card=el("details","exchange");
    card.id="exchange-"+(index+1);card.open=index===0;
    const summary=el("summary"), main=el("div","summary-main");
    main.append(el("h3","",exchange.title),el("div","route",exchange.sender+" → "+exchange.receiver));
    summary.append(el("span","step-number mono",String(index+1).padStart(2,"0")),main,
      el("span","status"+(exchange.response.status===200?" success":exchange.response.status===401?" challenge":""),String(exchange.response.status)),
      el("span","chevron","›"));
    card.append(summary,el("p","exchange-intro",exchange.summary));
    const tabs=el("div","tabs");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label",exchange.title);
    const panes=["request","response"].map(view=>makePane(exchange,index,view));
    ["request","response"].forEach((view,i) => {
      const tab=el("button","tab",view==="request"?"Request":"Response");
      tab.id="tab-"+index+"-"+view;tab.type="button";tab.dataset.view=view;tab.setAttribute("role","tab");
      tab.setAttribute("aria-controls",panes[i].id);
      const select=() => {
        panes.forEach((pane,n)=>pane.hidden=n!==i);
        [...tabs.children].forEach((node,n)=>{node.setAttribute("aria-selected",String(n===i));node.tabIndex=n===i?0:-1;});
      };
      tab.addEventListener("click",select);
      tab.addEventListener("keydown",event=>{
        if(event.key==="ArrowRight" || event.key==="ArrowLeft") {
          event.preventDefault(); const next=tabs.children[1-i];next.click();next.focus();
        }
      });
      tabs.append(tab);
    });
    card.append(tabs,...panes);$("exchanges").append(card);cards.push(card);
    tabs.children[0].click();
    // The side rail uses the short label; the full title stays on the card and in the tooltip.
    const nav=el("a","nav-link");nav.href="#"+card.id;nav.title=exchange.title;
    nav.append(el("span","nav-number mono",String(index+1).padStart(2,"0")),el("span","",exchange.nav || exchange.title));
    nav.addEventListener("click",()=>{card.open=true;});
    $("step-nav").append(nav);
  });
  const expandAll=$("expand-all");
  expandAll.hidden=false;
  expandAll.addEventListener("click",()=>{
    const open=cards.some(card=>!card.open);cards.forEach(card=>card.open=open);
    expandAll.textContent=open?"Close all exchanges":"Open all exchanges";
  });
  window.addEventListener("beforeprint",()=>cards.forEach(card=>{card.dataset.printOpen=String(card.open);card.open=true;}));
  window.addEventListener("afterprint",()=>cards.forEach(card=>{card.open=card.dataset.printOpen==="true";delete card.dataset.printOpen;}));
})();
