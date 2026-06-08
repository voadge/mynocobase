#!/bin/bash
# 服务端定时采集 - location_history 批补录
# 每10分钟由 cron 调用
# 通过 auth:signIn 动态获取 token，不硬编码

TOKEN=$(/usr/bin/docker exec noco-base-app-1 node -e "
var h=require('http');
var d=JSON.stringify({account:'voadge@voadge.cn',password:'875253tz@'});
var r=h.request({hostname:'127.0.0.1',port:13000,path:'/api/auth:signIn',method:'POST',headers:{'Content-Type':'application/json','Content-Length':d.length}},function(res){
var b='';res.on('data',function(c){b+=c});res.on('end',function(){try{var j=JSON.parse(b);console.log(j.data&&j.data.token||'');}catch(e){console.log('');}});
});r.write(d);r.end();
")

if [ -z "$TOKEN" ]; then
  echo "batch-collect: token获取失败"
  exit 1
fi

/usr/bin/docker exec noco-base-app-1 node -e "
var h=require('http');
h.get({hostname:'127.0.0.1',port:13000,path:'/api/__pd__/batch-collect',headers:{'Cookie':'nb_token=${TOKEN}'}},function(r){
var b='';r.on('data',function(c){b+=c});r.on('end',function(){console.log('batch-collect status='+r.statusCode+' body='+b.substring(0,100))})
}).on('error',function(e){console.log('batch-collect error:'+e.message)})
"
