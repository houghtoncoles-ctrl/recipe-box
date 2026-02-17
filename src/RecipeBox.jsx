import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const STORAGE_KEY = "shared-recipes-v1";
const PLAN_KEY    = "shared-mealplan-v1";
const CAT_EMOJI   = { appetizer:"🥗", entree:"🍽", dessert:"🍰" };
const CAT_COLOR   = { appetizer:"#7A9E7E", entree:"#C4622D", dessert:"#D4A853" };
const DAYS        = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

async function callClaude(messages, maxTokens = 1200) {
  let resp;
  try {
    // Calls our Netlify serverless proxy — API key never touches the browser
    resp = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages }),
    });
  } catch { throw new Error("Network error — check your connection."); }
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `API error ${resp.status}`);
  }
  const data = await resp.json();
  return (data.content || []).map(b => b.text || "").join("").trim();
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// STYLES (injected once)
// ─────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
:root {
  --cream:#FAF7F2; --warm:#FDF9F4; --ink:#1C1712; --brown:#5C3D2E;
  --terra:#C4622D; --sage:#7A9E7E; --gold:#D4A853; --lgold:#F0D9A8;
  --border:#E8DDD0; --shadow:rgba(92,61,46,0.13);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
body{font-family:'DM Sans',sans-serif;background:var(--cream);color:var(--ink);min-height:100vh;overscroll-behavior:none;}
#rb-root{display:flex;flex-direction:column;min-height:100vh;}

/* ── HEADER ── */
.rb-header{background:var(--ink);display:flex;align-items:center;justify-content:space-between;padding:0 1rem;height:56px;position:sticky;top:0;z-index:200;box-shadow:0 2px 16px rgba(0,0,0,0.35);}
.rb-logo{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--gold);white-space:nowrap;}
.rb-logo span{color:var(--cream);font-style:italic;}
.rb-header-btns{display:flex;gap:0.4rem;}
.rb-btn{display:inline-flex;align-items:center;gap:0.3rem;padding:0.45rem 0.85rem;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:500;cursor:pointer;border:none;transition:all 0.18s;white-space:nowrap;-webkit-user-select:none;user-select:none;}
.rb-btn:active{transform:scale(0.96);}
.rb-btn-primary{background:var(--terra);color:#fff;}
.rb-btn-outline{background:transparent;color:rgba(250,247,242,0.75);border:1px solid rgba(255,255,255,0.2);}
.rb-btn-outline:active{color:var(--gold);}
.rb-btn-sage{background:var(--sage);color:#fff;}
.rb-btn-blue{background:#4A7FA5;color:#fff;}
.rb-btn-ghost{background:transparent;color:var(--brown);border:1.5px solid var(--border);}
.rb-btn-danger{background:#fee;color:#c33;border:1px solid #fcc;}
.rb-btn-sm{padding:0.35rem 0.7rem;font-size:0.78rem;}
.rb-btn-lg{padding:0.65rem 1.3rem;font-size:0.92rem;}
.rb-btn-full{width:100%;justify-content:center;}

/* ── BOTTOM NAV (mobile) ── */
.rb-bottom-nav{position:fixed;bottom:0;left:0;right:0;background:var(--ink);display:flex;border-top:1px solid rgba(255,255,255,0.08);z-index:200;padding-bottom:env(safe-area-inset-bottom,0);}
.rb-bnav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0.55rem 0.25rem 0.45rem;cursor:pointer;color:rgba(250,247,242,0.45);font-size:0.65rem;font-weight:500;gap:0.2rem;transition:color 0.15s;border:none;background:transparent;font-family:'DM Sans',sans-serif;-webkit-user-select:none;user-select:none;}
.rb-bnav-item.active{color:var(--gold);}
.rb-bnav-icon{font-size:1.3rem;line-height:1;}

/* ── SYNC BANNER ── */
.rb-sync-bar{background:var(--ink);display:flex;align-items:center;justify-content:center;gap:0.5rem;padding:0.35rem 1rem;font-size:0.75rem;color:rgba(250,247,242,0.5);border-bottom:1px solid rgba(255,255,255,0.06);}
.rb-sync-dot{width:7px;height:7px;border-radius:50%;background:#ccc;flex-shrink:0;}
.rb-sync-dot.synced{background:var(--sage);}
.rb-sync-dot.syncing{background:var(--gold);animation:pulse 1s ease infinite;}
.rb-sync-dot.error{background:#f66;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}

/* ── HERO ── */
.rb-hero{background:var(--ink);padding:2rem 1.25rem 2.5rem;text-align:center;position:relative;overflow:hidden;}
.rb-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 65% 40%,rgba(196,98,45,0.18) 0%,transparent 60%),radial-gradient(ellipse at 20% 85%,rgba(122,158,126,0.1) 0%,transparent 50%);}
.rb-hero-content{position:relative;z-index:1;}
.rb-hero h1{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,5vw,2.8rem);color:var(--cream);line-height:1.15;margin-bottom:0.3rem;}
.rb-hero h1 em{color:var(--gold);font-style:italic;}
.rb-hero p{color:rgba(250,247,242,0.5);font-size:0.88rem;margin-bottom:1.4rem;}
.rb-search-wrap{display:flex;max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.3);}
.rb-search-wrap input{flex:1;padding:0.8rem 1rem;border:none;outline:none;font-family:'DM Sans',sans-serif;font-size:0.92rem;color:var(--ink);}
.rb-search-wrap button{padding:0.8rem 1.1rem;background:var(--terra);color:#fff;border:none;cursor:pointer;font-size:1rem;}

/* ── CATEGORY TABS ── */
.rb-cat-tabs{display:flex;gap:0.4rem;padding:0.9rem 1rem;background:var(--warm);border-bottom:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.rb-cat-tabs::-webkit-scrollbar{display:none;}
.rb-tab{padding:0.4rem 1rem;border-radius:50px;font-size:0.82rem;font-weight:500;cursor:pointer;border:1.5px solid var(--border);background:transparent;color:var(--brown);white-space:nowrap;font-family:'DM Sans',sans-serif;transition:all 0.15s;flex-shrink:0;}
.rb-tab.active{background:var(--terra);border-color:var(--terra);color:#fff;}

/* ── CONTENT AREA ── */
.rb-content{flex:1;padding-bottom:calc(4.5rem + env(safe-area-inset-bottom,0));}

/* ── RECIPE GRID ── */
.rb-grid-wrap{max-width:1200px;margin:0 auto;padding:1.25rem 1rem;}
.rb-grid-header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:1.1rem;}
.rb-grid-title{font-family:'Playfair Display',serif;font-size:1.35rem;}
.rb-grid-count{font-size:0.78rem;color:#999;}
.rb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;}
@media(min-width:480px){.rb-grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));}}
@media(min-width:768px){.rb-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1.25rem;}}

.rb-card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px var(--shadow);cursor:pointer;border:1px solid var(--border);transition:transform 0.18s,box-shadow 0.18s;}
.rb-card:active{transform:scale(0.97);}
@media(hover:hover){.rb-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px var(--shadow);}}
.rb-card-img{height:130px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;position:relative;overflow:hidden;}
@media(min-width:480px){.rb-card-img{height:150px;}}
.rb-card-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.rb-card-badge{position:absolute;top:8px;right:8px;padding:0.15rem 0.5rem;border-radius:50px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;}
.rb-card-body{padding:0.75rem 0.85rem 0.9rem;}
.rb-card-title{font-family:'Playfair Display',serif;font-size:1rem;margin-bottom:0.25rem;}
.rb-card-meta{display:flex;gap:0.6rem;font-size:0.72rem;color:#999;margin-bottom:0.4rem;flex-wrap:wrap;}
.rb-card-preview{font-size:0.75rem;color:#777;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}

.rb-empty{grid-column:1/-1;text-align:center;padding:3rem 1rem;color:#bbb;}
.rb-empty-icon{font-size:2.8rem;margin-bottom:0.8rem;}
.rb-empty h3{font-family:'Playfair Display',serif;font-size:1.2rem;color:#ccc;margin-bottom:0.4rem;}
.rb-empty p{font-size:0.85rem;}

/* ── FAB ── */
.rb-fab{position:fixed;right:1.1rem;bottom:calc(5.2rem + env(safe-area-inset-bottom,0));width:52px;height:52px;border-radius:50%;background:var(--terra);color:#fff;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 18px rgba(196,98,45,0.5);z-index:190;display:flex;align-items:center;justify-content:center;transition:transform 0.15s;}
.rb-fab:active{transform:scale(0.92);}

/* ── ASSISTANT PAGE ── */
.rb-assist-wrap{max-width:700px;margin:0 auto;padding:1.5rem 1rem 1rem;}
.rb-assist-header{text-align:center;margin-bottom:1.2rem;}
.rb-assist-header h2{font-family:'Playfair Display',serif;font-size:1.7rem;margin-bottom:0.25rem;}
.rb-assist-header p{color:#888;font-size:0.88rem;}
.rb-chips{display:flex;flex-wrap:wrap;gap:0.45rem;justify-content:center;margin-bottom:1.2rem;}
.rb-chip{padding:0.38rem 0.85rem;border-radius:50px;border:1.5px solid var(--border);background:#fff;font-size:0.8rem;color:var(--brown);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;}
.rb-chip:active{background:#f0f8f1;border-color:var(--sage);}
.rb-chat-window{background:#fff;border:1px solid var(--border);border-radius:10px;min-height:260px;max-height:55vh;overflow-y:auto;padding:1rem;margin-bottom:0.8rem;display:flex;flex-direction:column;gap:0.9rem;}
.rb-chat-msg{display:flex;gap:0.65rem;animation:fadeUp 0.25s ease;}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
.rb-chat-msg.user{flex-direction:row-reverse;}
.rb-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0;}
.rb-avatar.bot{background:var(--ink);color:var(--gold);}
.rb-avatar.user{background:var(--terra);color:#fff;}
.rb-bubble{max-width:85%;padding:0.65rem 0.9rem;border-radius:10px;font-size:0.86rem;line-height:1.6;}
.rb-bubble.bot{background:var(--cream);border:1px solid var(--border);}
.rb-bubble.user{background:var(--terra);color:#fff;}
.rb-recipe-ref{display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;background:#fff;border:1px solid var(--border);border-radius:50px;font-size:0.76rem;font-weight:500;color:var(--brown);cursor:pointer;margin:0.12rem;transition:all 0.12s;}
.rb-recipe-ref:active{background:var(--cream);color:var(--terra);}
.rb-typing{display:flex;gap:4px;align-items:center;padding:0.35rem 0;}
.rb-typing-dot{width:6px;height:6px;border-radius:50%;background:#ccc;animation:tBounce 1.1s ease infinite;}
.rb-typing-dot:nth-child(2){animation-delay:0.18s;}
.rb-typing-dot:nth-child(3){animation-delay:0.36s;}
@keyframes tBounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-5px);background:var(--sage);}}
.rb-chat-input{display:flex;gap:0.5rem;}
.rb-chat-input input{flex:1;padding:0.72rem 0.9rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;outline:none;-webkit-appearance:none;}
.rb-chat-input input:focus{border-color:var(--sage);}
.rb-chat-input button{padding:0.72rem 1rem;background:var(--sage);color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:500;cursor:pointer;}
.rb-chat-input button:disabled{opacity:0.5;}

/* ── PLANNER PAGE ── */
.rb-plan-wrap{max-width:1100px;margin:0 auto;padding:1.25rem 1rem;}
.rb-plan-header{margin-bottom:1rem;}
.rb-plan-header h2{font-family:'Playfair Display',serif;font-size:1.5rem;margin-bottom:0.2rem;}
.rb-plan-header p{color:#888;font-size:0.85rem;}
.rb-plan-opts{background:#fff;border:1px solid var(--border);border-radius:8px;padding:0.9rem 1rem;margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;}
.rb-plan-opts label{font-size:0.82rem;font-weight:500;color:var(--brown);}
.rb-plan-opts select,.rb-plan-opts input[type=text]{padding:0.4rem 0.7rem;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:0.84rem;color:var(--ink);background:#fff;outline:none;-webkit-appearance:none;}
.rb-plan-opts input[type=text]{flex:1;min-width:140px;}
.rb-plan-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:0.5rem;margin-bottom:1rem;}
@media(max-width:700px){.rb-plan-grid{grid-template-columns:repeat(4,1fr);}}
@media(max-width:400px){.rb-plan-grid{grid-template-columns:repeat(2,1fr);}}
.rb-day-col{background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
.rb-day-hd{background:var(--ink);color:var(--gold);font-family:'Playfair Display',serif;font-size:0.78rem;text-align:center;padding:0.4rem;letter-spacing:0.04em;}
.rb-day-meals{padding:0.4rem;}
.rb-meal-slot{border-radius:5px;padding:0.35rem 0.4rem;margin-bottom:0.35rem;font-size:0.72rem;}
.rb-meal-label{font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;opacity:0.6;margin-bottom:0.1rem;}
.rb-meal-name{font-weight:500;cursor:pointer;color:var(--ink);}
.rb-meal-name:active{text-decoration:underline;color:var(--terra);}
.rb-meal-slot.breakfast{background:#fff8f0;border-left:3px solid var(--gold);}
.rb-meal-slot.lunch{background:#f0f8f1;border-left:3px solid var(--sage);}
.rb-meal-slot.dinner{background:#fdf2ec;border-left:3px solid var(--terra);}
.rb-meal-slot.empty{background:var(--cream);border:1.5px dashed var(--border);color:#bbb;text-align:center;cursor:pointer;}
.rb-plan-summary{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1rem 1.1rem;font-size:0.86rem;line-height:1.7;color:#444;}
.rb-plan-summary h4{font-family:'Playfair Display',serif;font-size:0.95rem;color:var(--ink);margin-bottom:0.4rem;}
.rb-plan-status{display:flex;align-items:center;gap:0.7rem;padding:0.9rem 1rem;background:#fff;border:1px solid var(--border);border-radius:8px;font-size:0.86rem;margin-bottom:1rem;}
.rb-plan-empty{text-align:center;padding:3rem 1rem;color:#bbb;}
.rb-plan-empty-icon{font-size:2.8rem;margin-bottom:0.7rem;}
.rb-plan-empty h3{font-family:'Playfair Display',serif;font-size:1.15rem;color:#ccc;margin-bottom:0.35rem;}

/* ── SPINNER ── */
.rb-spinner{width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--terra);border-radius:50%;animation:spin 0.75s linear infinite;flex-shrink:0;}
@keyframes spin{to{transform:rotate(360deg);}}

/* ── MODAL ── */
.rb-overlay{display:none;position:fixed;inset:0;background:rgba(28,23,18,0.78);z-index:300;padding:1rem;overflow-y:auto;-webkit-overflow-scrolling:touch;backdrop-filter:blur(3px);}
.rb-overlay.open{display:flex;align-items:flex-start;justify-content:center;}
.rb-modal{background:#fff;border-radius:12px;width:100%;max-width:680px;padding:1.5rem;position:relative;margin:auto;box-shadow:0 20px 70px rgba(0,0,0,0.45);animation:mIn 0.22s ease;}
@keyframes mIn{from{opacity:0;transform:translateY(18px) scale(0.97);}to{opacity:1;transform:none;}}
.rb-modal-close{position:absolute;top:0.9rem;right:0.9rem;background:var(--cream);border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;color:var(--brown);}
.rb-modal-title{font-family:'Playfair Display',serif;font-size:1.55rem;margin-bottom:0.25rem;padding-right:2rem;}
.rb-modal-meta{display:flex;gap:0.9rem;color:#999;font-size:0.8rem;margin-bottom:1.2rem;flex-wrap:wrap;}
.rb-divider{border:none;border-top:1px solid var(--border);margin:1.1rem 0;}
.rb-section-title{font-family:'Playfair Display',serif;font-size:1rem;color:var(--brown);margin-bottom:0.65rem;}
.rb-ingredients{list-style:none;}
.rb-ingredients li{padding:0.32rem 0;border-bottom:1px solid var(--border);font-size:0.86rem;display:flex;align-items:center;gap:0.5rem;}
.rb-ingredients li::before{content:'·';color:var(--terra);font-size:1.1rem;flex-shrink:0;}
.rb-steps{list-style:none;}
.rb-steps li{display:flex;gap:0.8rem;margin-bottom:0.85rem;font-size:0.86rem;line-height:1.6;}
.rb-step-n{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--ink);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;margin-top:0.1rem;}

/* ── GROCERY LIST ── */
.rb-grocery-modal{max-width:560px;}
.rb-grocery-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;padding-right:2.5rem;}
.rb-grocery-header h3{font-family:'Playfair Display',serif;font-size:1.45rem;}
.rb-grocery-actions{display:flex;gap:0.5rem;margin-bottom:1.2rem;flex-wrap:wrap;}
.rb-grocery-section{margin-bottom:1.2rem;}
.rb-grocery-section-title{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#aaa;padding:0.3rem 0;margin-bottom:0.4rem;border-bottom:1px solid var(--border);}
.rb-grocery-item{display:flex;align-items:flex-start;gap:0.65rem;padding:0.5rem 0.2rem;border-bottom:1px solid #f5f0ea;cursor:pointer;transition:opacity 0.15s;}
.rb-grocery-item.checked{opacity:0.4;}
.rb-grocery-item.checked .rb-grocery-name{text-decoration:line-through;}
.rb-grocery-cb{width:20px;height:20px;border-radius:5px;border:2px solid var(--border);flex-shrink:0;margin-top:0.05rem;display:flex;align-items:center;justify-content:center;transition:all 0.15s;background:#fff;}
.rb-grocery-item.checked .rb-grocery-cb{background:var(--sage);border-color:var(--sage);color:#fff;}
.rb-grocery-name{font-size:0.9rem;color:var(--ink);line-height:1.4;flex:1;}
.rb-grocery-qty{font-size:0.8rem;color:var(--terra);font-weight:600;white-space:nowrap;flex-shrink:0;}
.rb-grocery-loading{display:flex;align-items:center;gap:0.8rem;padding:2rem 0;justify-content:center;color:#888;font-size:0.9rem;}
.rb-grocery-empty{text-align:center;padding:2rem;color:#bbb;font-size:0.9rem;}
.rb-grocery-progress{font-size:0.78rem;color:#aaa;margin-bottom:0.8rem;}
.rb-grocery-progress span{color:var(--sage);font-weight:600;}

/* ── ADD MODAL SPECIFIC ── */
.rb-upload-tabs{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:1.1rem;}
.rb-upload-tab{flex:1;padding:0.6rem;text-align:center;font-size:0.84rem;font-weight:500;cursor:pointer;border:none;background:transparent;color:var(--brown);font-family:'DM Sans',sans-serif;transition:all 0.15s;}
.rb-upload-tab.active{background:var(--ink);color:var(--gold);}
.rb-drop-zone{border:2px dashed var(--border);border-radius:10px;padding:1.8rem 1rem;text-align:center;cursor:pointer;transition:all 0.18s;background:var(--cream);}
.rb-drop-zone:active,.rb-drop-zone.drag{border-color:var(--terra);background:#fdf6f2;}
.rb-drop-zone-icon{font-size:2rem;margin-bottom:0.6rem;}
.rb-drop-zone p{font-size:0.86rem;color:#888;margin-bottom:0.25rem;}
.rb-drop-zone small{font-size:0.76rem;color:#aaa;}
.rb-upload-or{display:flex;align-items:center;gap:0.7rem;margin:0.9rem 0;color:#bbb;font-size:0.8rem;}
.rb-upload-or::before,.rb-upload-or::after{content:'';flex:1;height:1px;background:var(--border);}
.rb-camera-btn{display:flex;align-items:center;justify-content:center;gap:0.5rem;width:100%;padding:0.85rem;border:1.5px solid var(--border);border-radius:8px;background:white;color:var(--brown);font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:500;cursor:pointer;transition:all 0.15s;}
.rb-camera-btn:active{background:var(--cream);}
.rb-ai-status{display:flex;align-items:center;gap:0.65rem;padding:0.7rem 0.9rem;border-radius:8px;border:1px solid var(--border);font-size:0.82rem;margin-bottom:0.9rem;}
.rb-ai-status.ok{background:#f0f8f1;border-color:#b5ddb9;}
.rb-ai-status.err{background:#fdf2f2;border-color:#f5c2c7;color:#842029;}
.rb-form-group{margin-bottom:0.95rem;}
.rb-form-group label{display:block;font-size:0.8rem;font-weight:500;color:var(--brown);margin-bottom:0.3rem;}
.rb-form-group input,.rb-form-group select,.rb-form-group textarea{width:100%;padding:0.6rem 0.85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.88rem;color:var(--ink);background:#fff;outline:none;-webkit-appearance:none;}
.rb-form-group input:focus,.rb-form-group select:focus,.rb-form-group textarea:focus{border-color:var(--terra);}
.rb-form-group textarea{resize:vertical;min-height:60px;}
.rb-form-row{display:grid;grid-template-columns:1fr 1fr;gap:0.9rem;}
@media(max-width:400px){.rb-form-row{grid-template-columns:1fr;}}
.rb-ing-row{display:flex;gap:0.4rem;margin-bottom:0.4rem;}
.rb-ing-row input{flex:1;}
.rb-rm-btn{padding:0.4rem 0.6rem;background:#fee;border:1px solid #fcc;border-radius:6px;cursor:pointer;color:#c33;font-size:0.78rem;flex-shrink:0;}
.rb-step-row{display:flex;gap:0.45rem;margin-bottom:0.4rem;align-items:flex-start;}
.rb-step-badge{width:24px;height:24px;background:var(--ink);color:var(--gold);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;flex-shrink:0;margin-top:0.4rem;}
.rb-step-row textarea{flex:1;min-height:52px;}
.rb-step-row button{margin-top:0.4rem;}
.rb-add-btn{background:none;border:1.5px dashed var(--border);border-radius:8px;width:100%;padding:0.42rem;color:#aaa;font-family:'DM Sans',sans-serif;cursor:pointer;font-size:0.82rem;margin-bottom:0.75rem;transition:all 0.15s;}
.rb-add-btn:active{border-color:var(--terra);color:var(--terra);}
.rb-modal-footer{display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.2rem;padding-top:1rem;border-top:1px solid var(--border);}
`;

function injectCSS() {
  if (document.getElementById("rb-styles")) return;
  const s = document.createElement("style");
  s.id = "rb-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────
// STORAGE HELPERS (localStorage for self-hosted)
// ─────────────────────────────────────────────
async function loadShared(key) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function saveShared(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function SyncBar({ status }) {
  const dot = status === "synced" ? "synced" : status === "syncing" ? "syncing" : "error";
  const label = status === "synced" ? "Recipes saved" : status === "syncing" ? "Saving…" : "Could not save — check storage";
  return (
    <div className="rb-sync-bar">
      <span className={`rb-sync-dot ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

function RecipeCard({ recipe, onClick }) {
  const bg = recipe.category === "appetizer" ? "linear-gradient(135deg,#e8f5e9,#c8e6c9)"
    : recipe.category === "dessert" ? "linear-gradient(135deg,#fff8e1,#ffecb3)"
    : "linear-gradient(135deg,#fbe9e7,#ffccbc)";
  const badgeColor = CAT_COLOR[recipe.category] || "#888";
  const badgeText = recipe.category === "entree" ? "white" : recipe.category === "dessert" ? "#1C1712" : "white";
  return (
    <div className="rb-card" onClick={onClick}>
      <div className="rb-card-img" style={{ background: recipe.imageData ? undefined : bg }}>
        {recipe.imageData
          ? <img src={recipe.imageData} alt={recipe.name} />
          : <span>{CAT_EMOJI[recipe.category] || "🍴"}</span>}
        <span className="rb-card-badge" style={{ background: badgeColor, color: badgeText }}>
          {recipe.category || "other"}
        </span>
      </div>
      <div className="rb-card-body">
        <div className="rb-card-title">{recipe.name}</div>
        <div className="rb-card-meta">
          {recipe.prep && <span>⏱ {recipe.prep}</span>}
          {recipe.cook && <span>🔥 {recipe.cook}</span>}
          {recipe.servings && <span>👥 {recipe.servings}</span>}
        </div>
        <div className="rb-card-preview">
          {(recipe.ingredients || []).slice(0, 3).join(", ")}{(recipe.ingredients || []).length > 3 ? "…" : ""}
        </div>
      </div>
    </div>
  );
}

function ViewModal({ recipe, onClose, onDelete }) {
  if (!recipe) return null;
  const badgeColor = CAT_COLOR[recipe.category] || "#888";
  const badgeText = recipe.category === "dessert" ? "#1C1712" : "white";
  return (
    <div className="rb-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal">
        <button className="rb-modal-close" onClick={onClose}>✕</button>
        {recipe.imageData && <img src={recipe.imageData} alt={recipe.name} style={{width:"100%",height:200,objectFit:"cover",borderRadius:8,marginBottom:"1rem"}} />}
        <div style={{marginBottom:"0.35rem"}}>
          <span className="rb-card-badge" style={{position:"static",background:badgeColor,color:badgeText}}>{recipe.category}</span>
        </div>
        <h2 className="rb-modal-title">{recipe.name}</h2>
        <div className="rb-modal-meta">
          {recipe.prep && <span>⏱ Prep: {recipe.prep}</span>}
          {recipe.cook && <span>🔥 Cook: {recipe.cook}</span>}
          {recipe.servings && <span>👥 {recipe.servings}</span>}
        </div>
        <hr className="rb-divider" />
        <div className="rb-section-title">🥕 Ingredients</div>
        <ul className="rb-ingredients">
          {(recipe.ingredients || []).map((ing, i) => <li key={i}>{ing}</li>)}
        </ul>
        <hr className="rb-divider" />
        <div className="rb-section-title">👨‍🍳 Directions</div>
        <ol className="rb-steps">
          {(recipe.steps || []).map((step, i) => (
            <li key={i}><span className="rb-step-n">{i + 1}</span><span>{step}</span></li>
          ))}
        </ol>
        <div className="rb-modal-footer">
          <button className="rb-btn rb-btn-danger" onClick={() => onDelete(recipe.id)}>🗑 Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ADD RECIPE MODAL
// ─────────────────────────────────────────────
function AddModal({ onClose, onSave }) {
  const [tab, setTab] = useState("ai");
  const [aiStatus, setAiStatus] = useState(null); // null | {type:'loading'|'ok'|'err', msg}
  const [formVisible, setFormVisible] = useState(false);
  const [imageData, setImageData] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({ name:"", category:"", prep:"", cook:"", servings:"" });
  const [ingredients, setIngredients] = useState([""]);
  const [steps, setSteps] = useState([""]);
  const fileRef = useRef();
  const cameraRef = useRef();

  const updateForm = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const showForm = (reset = false) => {
    setFormVisible(true);
    if (reset) { setIngredients(["","",""]); setSteps(["",""]); }
  };

  const processFile = async (file) => {
    const allowed = ["application/pdf","image/jpeg","image/png","image/jpg","image/heic","image/heif"];
    if (!allowed.some(t => file.type === t || file.name.toLowerCase().endsWith(t.split("/")[1]))) {
      alert("Please upload a PDF, JPEG, PNG, or HEIC photo."); return;
    }
    setAiStatus({ type:"loading", msg:"Analyzing with AI…" });
    setFormVisible(false);
    const base64 = await fileToBase64(file);
    const isPDF = file.type === "application/pdf";
    if (!isPDF) setImageData("data:" + file.type + ";base64," + base64);

    try {
      const contentBlock = isPDF
        ? { type:"document", source:{ type:"base64", media_type:"application/pdf", data:base64 } }
        : { type:"image", source:{ type:"base64", media_type: file.type.includes("heic") || file.type.includes("heif") ? "image/jpeg" : file.type, data:base64 } };

      const prompt = `Extract the recipe from this ${isPDF ? "document" : "image"}. Return ONLY a raw JSON object with no markdown, no code fences:
{"name":"Recipe Name","category":"appetizer OR entree OR dessert","prep":"e.g. 15 mins","cook":"e.g. 30 mins","servings":"e.g. 4","ingredients":["2 cups flour","1 tsp salt"],"steps":["Preheat oven to 350°F.","Mix dry ingredients."]}
Rules: category must be exactly appetizer, entree, or dessert. Include amounts in ingredients. Return ONLY the JSON.`;

      const text = await callClaude([{ role:"user", content:[ contentBlock, { type:"text", text: prompt } ] }], 1200);
      const clean = text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse AI response.");
      const data = JSON.parse(match[0]);

      setForm({ name: data.name||"", category: data.category||"", prep: data.prep||"", cook: data.cook||"", servings: data.servings||"" });
      setIngredients(data.ingredients?.length ? data.ingredients : ["","",""]);
      setSteps(data.steps?.length ? data.steps : ["",""]);
      setAiStatus({ type:"ok", msg:"Recipe extracted — review and save below!" });
      setFormVisible(true);
    } catch (err) {
      const isBlocked = err.message === "NETWORK_BLOCKED" || err.message?.includes("fetch");
      setAiStatus({ type:"err", msg: isBlocked
        ? "AI extraction requires Claude.ai. Fill in manually below."
        : (err.message || "Could not extract. Please fill in manually.") });
      setIngredients(["","",""]);
      setSteps(["",""]);
      setFormVisible(true);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleSave = () => {
    if (!form.name.trim()) { alert("Please enter a recipe name."); return; }
    if (!form.category) { alert("Please select a category."); return; }
    const filteredIngs = ingredients.filter(i => i.trim());
    const filteredSteps = steps.filter(s => s.trim());
    onSave({ id: uid(), ...form, ingredients: filteredIngs, steps: filteredSteps, imageData, createdAt: Date.now() });
  };

  return (
    <div className="rb-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal">
        <button className="rb-modal-close" onClick={onClose}>✕</button>
        <h2 className="rb-modal-title" style={{marginBottom:"1.1rem"}}>Add Recipe</h2>

        <div className="rb-upload-tabs">
          <button className={`rb-upload-tab${tab==="ai"?" active":""}`} onClick={() => { setTab("ai"); setFormVisible(false); }}>✦ AI Upload</button>
          <button className={`rb-upload-tab${tab==="manual"?" active":""}`} onClick={() => { setTab("manual"); showForm(true); }}>✎ Manual Entry</button>
        </div>

        {tab === "ai" && (
          <div>
            {/* Drop zone */}
            <div
              className={`rb-drop-zone${dragging?" drag":""}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" style={{display:"none"}} onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
              <div className="rb-drop-zone-icon">📄</div>
              <p><strong>Drop a file</strong> or tap to browse</p>
              <small>PDF, JPEG, or PNG</small>
            </div>

            {/* Camera / photo library (mobile) */}
            <div className="rb-upload-or">or</div>
            <button className="rb-camera-btn" onClick={() => cameraRef.current?.click()}>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
              📷 Take a Photo with Camera
            </button>
            <div style={{marginTop:"0.5rem"}}>
              <button className="rb-camera-btn" onClick={() => { const inp = document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.onchange=e=>e.target.files[0]&&processFile(e.target.files[0]); inp.click(); }}>
                🖼 Choose from Photo Library
              </button>
            </div>
          </div>
        )}

        {/* AI status */}
        {aiStatus && (
          <div className={`rb-ai-status${aiStatus.type==="ok"?" ok":aiStatus.type==="err"?" err":""}`} style={{marginTop:"0.9rem"}}>
            {aiStatus.type === "loading" && <div className="rb-spinner" />}
            {aiStatus.type === "ok" && <span>✓</span>}
            {aiStatus.type === "err" && <span>⚠</span>}
            <span>{aiStatus.msg}</span>
          </div>
        )}

        {/* Shared form */}
        {formVisible && (
          <div>
            <hr className="rb-divider" />
            <div className="rb-form-row">
              <div className="rb-form-group">
                <label>Recipe Name *</label>
                <input value={form.name} onChange={updateForm("name")} placeholder="e.g. Lemon Chicken" />
              </div>
              <div className="rb-form-group">
                <label>Category *</label>
                <select value={form.category} onChange={updateForm("category")}>
                  <option value="">Select…</option>
                  <option value="appetizer">Appetizer</option>
                  <option value="entree">Entrée</option>
                  <option value="dessert">Dessert</option>
                </select>
              </div>
            </div>
            <div className="rb-form-row">
              <div className="rb-form-group">
                <label>Prep Time</label>
                <input value={form.prep} onChange={updateForm("prep")} placeholder="e.g. 15 mins" />
              </div>
              <div className="rb-form-group">
                <label>Cook Time</label>
                <input value={form.cook} onChange={updateForm("cook")} placeholder="e.g. 30 mins" />
              </div>
            </div>
            <div className="rb-form-group">
              <label>Servings</label>
              <input value={form.servings} onChange={updateForm("servings")} placeholder="e.g. 4 servings" />
            </div>

            <hr className="rb-divider" />
            <div className="rb-section-title">🥕 Ingredients</div>
            {ingredients.map((ing, i) => (
              <div key={i} className="rb-ing-row">
                <input value={ing} onChange={e => { const a=[...ingredients]; a[i]=e.target.value; setIngredients(a); }} placeholder="e.g. 2 cups flour" />
                <button className="rb-rm-btn" onClick={() => setIngredients(ingredients.filter((_,j)=>j!==i))}>✕</button>
              </div>
            ))}
            <button className="rb-add-btn" onClick={() => setIngredients([...ingredients, ""])}>+ Add Ingredient</button>

            <div className="rb-section-title">👨‍🍳 Directions</div>
            {steps.map((step, i) => (
              <div key={i} className="rb-step-row">
                <span className="rb-step-badge">{i+1}</span>
                <textarea value={step} onChange={e => { const a=[...steps]; a[i]=e.target.value; setSteps(a); }} placeholder="Describe this step…" />
                <button className="rb-rm-btn" onClick={() => setSteps(steps.filter((_,j)=>j!==i))}>✕</button>
              </div>
            ))}
            <button className="rb-add-btn" onClick={() => setSteps([...steps, ""])}>+ Add Step</button>

            <div className="rb-modal-footer">
              <button className="rb-btn rb-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="rb-btn rb-btn-primary" onClick={handleSave}>Save Recipe</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ASSISTANT PAGE
// ─────────────────────────────────────────────
const CHIPS = ["What's quick tonight?","Something light & healthy","Impress my guests","Something with pasta","What's for dessert?","Surprise me!"];

function AssistantPage({ recipes, onViewRecipe }) {
  const [msgs, setMsgs] = useState([{ role:"bot", content:"Hi! I'm your kitchen assistant. Tell me what you're in the mood for and I'll pick from your recipe collection. Try asking <em>\"what's quick tonight?\"</em> or just say <em>\"surprise me!\"</em>", isHtml:true }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef();

  const scrollBottom = () => setTimeout(() => { if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, 50);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMsgs(m => [...m, { role:"user", content: msg }]);
    setLoading(true);
    scrollBottom();

    const recipeList = recipes.map(r =>
      `ID:${r.id} | "${r.name}" | Category:${r.category} | Prep:${r.prep||"?"} | Cook:${r.cook||"?"} | Key ingredients: ${(r.ingredients||[]).slice(0,4).join(", ")}`
    ).join("\n");

    const prompt = `You are a warm kitchen assistant. Suggest 1-3 recipes from this collection based on the user's request.

RECIPE COLLECTION:
${recipeList || "(Empty — no recipes yet)"}

RULES:
- Only suggest recipes from the list. Never invent new ones.
- After each recipe name, add [ID:theIdHere] so the UI can link to it.
- If collection is empty, encourage them to add recipes first.
- Keep tone warm and enthusiastic. Be concise (2-4 sentences per suggestion).

User: ${msg}`;

    try {
      const resp = await callClaude([{ role:"user", content: prompt }], 700);
      const html = resp.replace(/\[ID:([a-z0-9]+)\]/g, (_, id) => {
        const r = recipes.find(r => r.id === id);
        return r ? `<span class="rb-recipe-ref" onclick="window._viewRecipe('${id}')">📋 ${r.name}</span>` : "";
      });
      setMsgs(m => [...m, { role:"bot", content: html, isHtml:true }]);
    } catch {
      setMsgs(m => [...m, { role:"bot", content:"⚠ Something went wrong. Try again!" }]);
    }
    setLoading(false);
    scrollBottom();
  };

  useEffect(() => { window._viewRecipe = onViewRecipe; }, [onViewRecipe]);

  return (
    <div className="rb-content">
      <div className="rb-assist-wrap">
        <div className="rb-assist-header">
          <h2>What should I make? 🍴</h2>
          <p>Ask me anything — I'll suggest from <em>your</em> recipe collection.</p>
        </div>
        <div className="rb-chips">
          {CHIPS.map(c => <button key={c} className="rb-chip" onClick={() => send(c)}>{c}</button>)}
        </div>
        <div className="rb-chat-window" ref={chatRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`rb-chat-msg ${m.role}`}>
              <div className={`rb-avatar ${m.role}`}>{m.role === "bot" ? "✦" : "👤"}</div>
              <div className={`rb-bubble ${m.role}`}
                dangerouslySetInnerHTML={m.isHtml ? { __html: m.content } : undefined}>
                {!m.isHtml ? m.content : undefined}
              </div>
            </div>
          ))}
          {loading && (
            <div className="rb-chat-msg bot">
              <div className="rb-avatar bot">✦</div>
              <div className="rb-bubble bot">
                <div className="rb-typing">
                  <div className="rb-typing-dot"/><div className="rb-typing-dot"/><div className="rb-typing-dot"/>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="rb-chat-input">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && send()}
            placeholder="What are you in the mood for?" />
          <button onClick={() => send()} disabled={loading}>Ask ✦</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GROCERY LIST MODAL
// ─────────────────────────────────────────────
function GroceryListModal({ groceryList, loading, onClose }) {
  const [checked, setChecked] = useState({});

  const toggle = (key) => setChecked(c => ({ ...c, [key]: !c[key] }));

  const totalItems = groceryList ? groceryList.reduce((n, s) => n + s.items.length, 0) : 0;
  const checkedCount = Object.values(checked).filter(Boolean).length;

  const copyToClipboard = () => {
    if (!groceryList) return;
    const text = groceryList.map(section =>
      `${section.section.toUpperCase()}\n` +
      section.items.map(item => `• ${item.quantity ? item.quantity + " " : ""}${item.name}`).join("\n")
    ).join("\n\n");
    navigator.clipboard?.writeText(text).then(() => alert("Grocery list copied to clipboard!"))
      .catch(() => alert("Copy not supported — screenshot the list instead!"));
  };

  return (
    <div className="rb-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal rb-grocery-modal">
        <button className="rb-modal-close" onClick={onClose}>✕</button>

        <div className="rb-grocery-header">
          <h3>🛒 Grocery List</h3>
        </div>

        {loading && (
          <div className="rb-grocery-loading">
            <div className="rb-spinner" />
            <span>Building your smart grocery list…</span>
          </div>
        )}

        {!loading && groceryList && (
          <>
            <div className="rb-grocery-actions">
              <button className="rb-btn rb-btn-sage rb-btn-sm" onClick={copyToClipboard}>📋 Copy List</button>
              <button className="rb-btn rb-btn-ghost rb-btn-sm" onClick={() => setChecked({})}>Reset Checks</button>
            </div>

            {totalItems > 0 && (
              <div className="rb-grocery-progress">
                <span>{checkedCount}</span> of {totalItems} items checked off
              </div>
            )}

            {groceryList.map((section, si) => (
              <div key={si} className="rb-grocery-section">
                <div className="rb-grocery-section-title">{section.section}</div>
                {section.items.map((item, ii) => {
                  const key = `${si}-${ii}`;
                  const isChecked = !!checked[key];
                  return (
                    <div key={ii} className={`rb-grocery-item${isChecked ? " checked" : ""}`} onClick={() => toggle(key)}>
                      <div className="rb-grocery-cb">{isChecked ? "✓" : ""}</div>
                      <div className="rb-grocery-name">{item.name}</div>
                      {item.quantity && <div className="rb-grocery-qty">{item.quantity}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {!loading && !groceryList && (
          <div className="rb-grocery-empty">Could not generate grocery list. Please try again.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PLANNER PAGE
// ─────────────────────────────────────────────
function PlannerPage({ recipes, savedPlan, onPlanSave, onViewRecipe }) {
  const [plan, setPlan] = useState(savedPlan);
  const [prefs, setPrefs] = useState("");
  const [mealsPerDay, setMealsPerDay] = useState("dinner");
  const [status, setStatus] = useState(null);
  const [showGrocery, setShowGrocery] = useState(false);
  const [groceryList, setGroceryList] = useState(null);
  const [groceryLoading, setGroceryLoading] = useState(false);

  const mealSlots = { "dinner":["dinner"], "lunch-dinner":["lunch","dinner"], "all":["breakfast","lunch","dinner"] }[mealsPerDay] || ["dinner"];

  const generate = async () => {
    if (recipes.length < 2) { alert("Add at least 2 recipes to generate a plan!"); return; }
    setStatus({ type:"loading", msg:"Generating your personalized meal plan…" });
    setPlan(null);
    setGroceryList(null);

    const recipeList = recipes.map(r => `ID:${r.id} | "${r.name}" | Category:${r.category} | Prep:${r.prep||"?"}`).join("\n");

    const prompt = `Create a 7-day meal plan using ONLY these recipes:
${recipeList}

Requirements:
- Days: Monday through Sunday
- Meals per day: ${mealSlots.join(", ")}
- Preferences: ${prefs || "none"}
- Avoid repeating same recipe in same slot across the week
- Use entrees for lunch/dinner, any category for breakfast

Return ONLY valid JSON, no markdown:
{"days":[{"day":"Monday",${mealSlots.map(m=>`"${m}":{"id":"<recipeId>","name":"<recipe name>"}`).join(",")}}],"notes":"Brief 1-2 sentence summary"}`;

    try {
      const raw = await callClaude([{ role:"user", content: prompt }], 1400);
      const clean = raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse plan.");
      const p = JSON.parse(match[0]);
      setPlan(p);
      onPlanSave(p);
      setStatus(null);
    } catch (err) {
      setStatus({ type:"err", msg: err.message || "Could not generate. Please try again." });
    }
  };

  const generateGroceryList = async (currentPlan) => {
    setShowGrocery(true);
    setGroceryLoading(true);
    setGroceryList(null);

    // Gather all recipe IDs used in the plan
    const usedIds = new Set();
    (currentPlan.days || []).forEach(day => {
      mealSlots.forEach(slot => {
        if (day[slot]?.id) usedIds.add(day[slot].id);
      });
    });

    const usedRecipes = recipes.filter(r => usedIds.has(r.id));
    if (!usedRecipes.length) { setGroceryLoading(false); return; }

    // Build ingredient list with recipe context
    const ingredientDump = usedRecipes.map(r =>
      `Recipe: "${r.name}" (serves ${r.servings || "4"})\nIngredients:\n${(r.ingredients || []).map(i => "  - " + i).join("\n")}`
    ).join("\n\n");

    const prompt = `You are a smart grocery assistant. I have a weekly meal plan and need a consolidated grocery list.

Here are all the recipes being used this week and their ingredients:

${ingredientDump}

Your job:
1. Combine duplicate or similar ingredients across all recipes (e.g. if two recipes each need garlic, combine them)
2. Round up quantities to real store-buyable units — what you'd actually buy at a grocery store:
   - "3 oz tomato paste" → "1 can (6 oz)" not "3 oz"
   - "1 tbsp butter" → "1 stick butter" not "1 tbsp"  
   - "1/4 cup olive oil" → "1 bottle (16 oz)" not "1/4 cup"
   - "2 cups chicken broth" → "1 carton (32 oz)" not "2 cups"
   - "1 lemon" → "2 lemons" (buy a couple extra)
   - Produce: round up to a sensible quantity (e.g. "3 cloves garlic" → "1 head garlic")
   - Spices already in most pantries (salt, pepper, common spices) → list as "pantry staple"
3. Organize by grocery store section

Return ONLY valid JSON, no markdown, no fences:
{
  "sections": [
    {
      "section": "Produce",
      "items": [
        { "name": "Yellow onions", "quantity": "3 medium" },
        { "name": "Garlic", "quantity": "1 head" }
      ]
    },
    {
      "section": "Meat & Seafood",
      "items": [...]
    },
    {
      "section": "Dairy & Eggs",
      "items": [...]
    },
    {
      "section": "Pantry & Dry Goods",
      "items": [...]
    },
    {
      "section": "Canned & Jarred",
      "items": [...]
    },
    {
      "section": "Frozen",
      "items": [...]
    },
    {
      "section": "Pantry Staples",
      "items": [{ "name": "Salt, pepper, olive oil, etc.", "quantity": "as needed" }]
    }
  ]
}

Only include sections that have items. Be practical — this is a real shopping list.`;

    try {
      const raw = await callClaude([{ role:"user", content: prompt }], 1800);
      const clean = raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Parse error");
      const data = JSON.parse(match[0]);
      // Normalize: sections array → flat sections with items
      const normalized = (data.sections || [])
        .filter(s => s.items && s.items.length > 0)
        .map(s => ({ section: s.section, items: s.items }));
      setGroceryList(normalized);
    } catch {
      setGroceryList(null);
    }
    setGroceryLoading(false);
  };

  return (
    <div className="rb-content">
      <div className="rb-plan-wrap">
        <div className="rb-plan-header">
          <h2>📅 Weekly Meal Planner</h2>
          <p>AI-generated from your recipe collection</p>
        </div>

        <div className="rb-plan-opts">
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexWrap:"wrap",flex:1}}>
            <label>Meals:</label>
            <select value={mealsPerDay} onChange={e => setMealsPerDay(e.target.value)} style={{minWidth:120}}>
              <option value="dinner">Dinner only</option>
              <option value="lunch-dinner">Lunch + Dinner</option>
              <option value="all">All 3 meals</option>
            </select>
            <input type="text" value={prefs} onChange={e => setPrefs(e.target.value)} placeholder="Preferences (e.g. no repeats)" style={{flex:1,minWidth:130}} />
          </div>
          <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
            <button className="rb-btn rb-btn-blue" onClick={generate}>✦ Generate Plan</button>
            {plan && <button className="rb-btn rb-btn-sage" onClick={() => generateGroceryList(plan)}>🛒 Grocery List</button>}
            {plan && <button className="rb-btn rb-btn-ghost rb-btn-sm" onClick={() => { setPlan(null); onPlanSave(null); setGroceryList(null); }}>Clear</button>}
          </div>
        </div>

        {status && (
          <div className={`rb-plan-status${status.type==="err"?" rb-ai-status err":""}`}>
            {status.type === "loading" && <><div className="rb-spinner" /><span>{status.msg}</span></>}
            {status.type === "err" && <><span>⚠</span><span>{status.msg}</span></>}
          </div>
        )}

        {!plan && !status && (
          <div className="rb-plan-empty">
            <div className="rb-plan-empty-icon">📅</div>
            <h3>No plan yet</h3>
            <p>Click "Generate Plan" to create your week's menu.</p>
          </div>
        )}

        {plan && (
          <>
            <div className="rb-plan-grid">
              {(plan.days || []).map((day, di) => (
                <div key={di} className="rb-day-col">
                  <div className="rb-day-hd">{DAY_SHORT[di] || day.day}</div>
                  <div className="rb-day-meals">
                    {mealSlots.map(slot => {
                      const meal = day[slot];
                      if (!meal || !meal.name || meal.name === "Flexible") {
                        return <div key={slot} className="rb-meal-slot empty"><div className="rb-meal-label">{slot}</div>+ Add</div>;
                      }
                      const linked = meal.id && recipes.find(r => r.id === meal.id);
                      return (
                        <div key={slot} className={`rb-meal-slot ${slot}`}>
                          <div className="rb-meal-label">{slot}</div>
                          <div className="rb-meal-name" onClick={() => linked && onViewRecipe(meal.id)}>{meal.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {plan.notes && (
              <div className="rb-plan-summary">
                <h4>✦ This Week's Plan</h4>
                <p>{plan.notes}</p>
                <div style={{marginTop:"0.9rem"}}>
                  <button className="rb-btn rb-btn-sage" onClick={() => generateGroceryList(plan)}>
                    🛒 Build Grocery List for This Week
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showGrocery && (
        <GroceryListModal
          groceryList={groceryList}
          loading={groceryLoading}
          onClose={() => setShowGrocery(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  injectCSS();

  const [recipes, setRecipes] = useState([]);
  const [syncStatus, setSyncStatus] = useState("syncing");
  const [page, setPage] = useState("recipes");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [viewRecipe, setViewRecipe] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [savedPlan, setSavedPlan] = useState(null);
  const syncTimer = useRef(null);

  // ── Load from shared storage on mount ──
  useEffect(() => {
    (async () => {
      setSyncStatus("syncing");
      try {
        const data = await loadShared(STORAGE_KEY);
        if (data?.recipes) setRecipes(data.recipes);
        const planData = await loadShared(PLAN_KEY);
        if (planData) setSavedPlan(planData);
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    })();
  }, []);

  // ── Save to shared storage (debounced) ──
  const persistRecipes = useCallback((newRecipes) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncStatus("syncing");
    syncTimer.current = setTimeout(async () => {
      const ok = await saveShared(STORAGE_KEY, { recipes: newRecipes, updatedAt: Date.now() });
      setSyncStatus(ok ? "synced" : "error");
    }, 600);
  }, []);

  const addRecipe = (recipe) => {
    const updated = [recipe, ...recipes];
    setRecipes(updated);
    persistRecipes(updated);
    setShowAdd(false);
  };

  const deleteRecipe = (id) => {
    if (!confirm("Delete this recipe?")) return;
    const updated = recipes.filter(r => r.id !== id);
    setRecipes(updated);
    persistRecipes(updated);
    setViewRecipe(null);
  };

  const handlePlanSave = async (plan) => {
    setSavedPlan(plan);
    if (plan) await saveShared(PLAN_KEY, plan);
  };

  // ── Filtered recipes ──
  const filtered = recipes.filter(r => {
    if (category !== "all" && r.category !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.ingredients||[]).some(i => i.toLowerCase().includes(q));
    }
    return true;
  });

  const catLabels = { all:"All Recipes", appetizer:"Appetizers", entree:"Entrées", dessert:"Desserts" };

  return (
    <div id="rb-root">
      {/* Header */}
      <header className="rb-header">
        <div className="rb-logo">The <span>Recipe Box</span></div>
        <div className="rb-header-btns">
          <button className="rb-btn rb-btn-outline rb-btn-sm" onClick={() => setShowAdd(true)}>+ Add</button>
        </div>
      </header>

      {/* Sync bar */}
      <SyncBar status={syncStatus} />

      {/* Recipe page */}
      {page === "recipes" && (
        <>
          <section className="rb-hero">
            <div className="rb-hero-content">
              <h1>Your <em>personal</em><br />recipe collection</h1>
              <p>Every dish, beautifully organized — synced for both of you.</p>
              <div className="rb-search-wrap">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes or ingredients…" />
                <button>🔍</button>
              </div>
            </div>
          </section>

          <div className="rb-cat-tabs">
            {["all","appetizer","entree","dessert"].map(c => (
              <button key={c} className={`rb-tab${category===c?" active":""}`} onClick={() => setCategory(c)}>
                {c === "all" ? "All Recipes" : c === "appetizer" ? "🥗 Appetizers" : c === "entree" ? "🍽 Entrées" : "🍰 Desserts"}
              </button>
            ))}
          </div>

          <div className="rb-content">
            <div className="rb-grid-wrap">
              <div className="rb-grid-header">
                <div className="rb-grid-title">{catLabels[category] || "Recipes"}</div>
                <div className="rb-grid-count">{filtered.length} recipe{filtered.length !== 1 ? "s" : ""}</div>
              </div>
              <div className="rb-grid">
                {filtered.length === 0 ? (
                  <div className="rb-empty">
                    <div className="rb-empty-icon">{search ? "🔍" : "📖"}</div>
                    <h3>{search ? "No recipes found" : "No recipes yet"}</h3>
                    <p>{search ? "Try a different search." : "Tap + Add to upload your first recipe!"}</p>
                  </div>
                ) : filtered.map(r => (
                  <RecipeCard key={r.id} recipe={r} onClick={() => setViewRecipe(r)} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Assistant page */}
      {page === "assistant" && (
        <AssistantPage recipes={recipes} onViewRecipe={id => { setViewRecipe(recipes.find(r => r.id === id)); setPage("recipes"); }} />
      )}

      {/* Planner page */}
      {page === "planner" && (
        <PlannerPage recipes={recipes} savedPlan={savedPlan} onPlanSave={handlePlanSave}
          onViewRecipe={id => { setViewRecipe(recipes.find(r => r.id === id)); setPage("recipes"); }} />
      )}

      {/* FAB (only on recipe page) */}
      {page === "recipes" && (
        <button className="rb-fab" onClick={() => setShowAdd(true)} aria-label="Add recipe">＋</button>
      )}

      {/* Bottom nav */}
      <nav className="rb-bottom-nav">
        {[["recipes","📖","Recipes"],["assistant","🍴","Dinner?"],["planner","📅","Planner"]].map(([p,icon,label]) => (
          <button key={p} className={`rb-bnav-item${page===p?" active":""}`} onClick={() => setPage(p)}>
            <span className="rb-bnav-icon">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Modals */}
      {viewRecipe && <ViewModal recipe={viewRecipe} onClose={() => setViewRecipe(null)} onDelete={deleteRecipe} />}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={addRecipe} />}
    </div>
  );
}
