/*
  2022-08-24

  The author disclaims copyright to this source code.  In place of a
  legal notice, here is a blessing:

  *   May you do good and not evil.
  *   May you find forgiveness for yourself and forgive others.
  *   May you share freely, never taking more than you give.

  ***********************************************************************

  This file implements a Promise-based proxy for the sqlite3 Worker
  API #1. It is intended to be included either from the main thread or
  a Worker, but only if (A) the environment supports nested Workers
  and (B) it's _not_ a Worker which loads the sqlite3 WASM/JS
  module. This file's features will load that module and provide a
  slightly simpler client-side interface than the slightly-lower-level
  Worker API does.

  This script necessarily exposes one global symbol, but clients may
  freely `delete` that symbol after calling it.
*/
'use strict';

globalThis.sqlite3Worker1Promiser = function callee(config = callee.defaultConfig){
  
  if(1===arguments.length && 'function'===typeof arguments[0]){
    const f = config;
    config = Object.assign(Object.create(null), callee.defaultConfig);
    config.onready = f;
  }else{
    config = Object.assign(Object.create(null), callee.defaultConfig, config);
  }
  const handlerMap = Object.create(null);
  const noop = function(){};
  const err = config.onerror
        || noop ;
  const debug = config.debug || noop;
  const idTypeMap = config.generateMessageId ? undefined : Object.create(null);
  const genMsgId = config.generateMessageId || function(msg){
    return msg.type+'#'+(idTypeMap[msg.type] = (idTypeMap[msg.type]||0) + 1);
  };
  const toss = (...args)=>{throw new Error(args.join(' '))};
  if(!config.worker) config.worker = callee.defaultConfig.worker;
  if('function'===typeof config.worker) config.worker = config.worker();
  let dbId;
  config.worker.onmessage = function(ev){
    ev = ev.data;
    debug('worker1.onmessage',ev);
    let msgHandler = handlerMap[ev.messageId];
    if(!msgHandler){
      if(ev && 'sqlite3-api'===ev.type && 'worker1-ready'===ev.result) {
        
        if(config.onready) config.onready();
        return;
      }
      msgHandler = handlerMap[ev.type] ;
      if(msgHandler && msgHandler.onrow){
        msgHandler.onrow(ev);
        return;
      }
      if(config.onunhandled) config.onunhandled(arguments[0]);
      else err("sqlite3Worker1Promiser() unhandled worker message:",ev);
      return;
    }
    delete handlerMap[ev.messageId];
    switch(ev.type){
        case 'error':
          msgHandler.reject(ev);
          return;
        case 'open':
          if(!dbId) dbId = ev.dbId;
          break;
        case 'close':
          if(ev.dbId===dbId) dbId = undefined;
          break;
        default:
          break;
    }
    try {msgHandler.resolve(ev)}
    catch(e){msgHandler.reject(e)}
  };
  return function(){
    let msg;
    if(1===arguments.length){
      msg = arguments[0];
    }else if(2===arguments.length){
      msg = Object.create(null);
      msg.type = arguments[0];
      msg.args = arguments[1];
    }else{
      toss("Invalid arugments for sqlite3Worker1Promiser()-created factory.");
    }
    if(!msg.dbId) msg.dbId = dbId;
    msg.messageId = genMsgId(msg);
    msg.departureTime = performance.now();
    const proxy = Object.create(null);
    proxy.message = msg;
    let rowCallbackId ;
    if('exec'===msg.type && msg.args){
      if('function'===typeof msg.args.callback){
        rowCallbackId = msg.messageId+':row';
        proxy.onrow = msg.args.callback;
        msg.args.callback = rowCallbackId;
        handlerMap[rowCallbackId] = proxy;
      }else if('string' === typeof msg.args.callback){
        toss("exec callback may not be a string when using the Promise interface.");
        
      }
    }
    
    let p = new Promise(function(resolve, reject){
      proxy.resolve = resolve;
      proxy.reject = reject;
      handlerMap[msg.messageId] = proxy;
      debug("Posting",msg.type,"message to Worker dbId="+(dbId||'default')+':',msg);
      config.worker.postMessage(msg);
    });
    if(rowCallbackId) p = p.finally(()=>delete handlerMap[rowCallbackId]);
    return p;
  };
};
globalThis.sqlite3Worker1Promiser.defaultConfig = {
  worker: function(){
    let theJs = "sqlite3-worker1.js";
    if(this.currentScript){
      const src = this.currentScript.src.split('/');
      src.pop();
      theJs = src.join('/')+'/' + theJs;
      
    }else if(globalThis.location){
      
      const urlParams = new URL(globalThis.location.href).searchParams;
      if(urlParams.has('sqlite3.dir')){
        theJs = urlParams.get('sqlite3.dir') + '/' + theJs;
      }
    }
    return new Worker(theJs + globalThis.location.search);
  }.bind({
    currentScript: globalThis?.document?.currentScript
  }),
  onerror: (...args)=>console.error('worker1 promiser error',...args)
};
