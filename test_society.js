var express = require('express');
var http = require('http');
var querystring = require('querystring');
var net = require('net');
var url = require('url');
var parser = require('xml2json');
var config = require('./config').society_config;

var set_cookies = function(cookies,options) {
  var cookie_str = '';
  var cookie_key = ['phpMyAdmin',
   'pma_length', 
   'pmaUser-1', 
   'pmaPass-1', 
   'pma_mcrypt_iv', 
   'JSESSIONID' 
  ];
  for(var key in cookies) {
    if(cookie_key.indexOf(key)>-1) {
      console.log('key ('+key+'=>'+cookies[key]+')');
      cookie_str+=key+'='+cookies[key]+'; ';
    }
  };
  if(options['headers']) {
    options['headers']['Cookie']=cookie_str;
  } else {
    options['headers'] = {'Cookie':cookie_str};
  }
};
 
var update_cookies = function(res,cookies) {
  if(res.headers['set-cookie']) {
    res.headers['set-cookie'].forEach(function(set_cookies) {
      set_cookies.split(';').forEach(function(cookie) {
        var parts = cookie.split('=');
        cookies[parts[0].trim()] = (parts[1]||'').trim();
      });
    });
  }
};

exports.get_cid = function(s_req,s_res) {
  try {
    core_get_cid(s_req,s_res);
  } catch(err) {
    s_res.json({'success':false});
  }
};

var core_get_cid = function(s_req,s_res) {

var cid_data = {
 //'id':'1580500099158',
 'wicket:bookmarkablePage':':com.dse.oss.web.search.SearchDataPageResult'
};

var first_data = {
 'wicket:interface':':2:searchrequestform:theContainerRequest:'+
   'requestView:1:popupLink::ILinkListener::'
};

var login_data = {
  username:config.user,
  password:config.password
};

var sql_page = {
  hostname:'www.paihospital.com',
  path :'/pma/sql.php?',
  method : 'GET'
};

var cid_query_page = {
  hostname: 'ossprovince.m-society.go.th',
  path :'/oss/oss/?',
  method : 'GET',
  headers : {
  }
};

var first_id_get = {
  hostname: 'ossprovince.m-society.go.th',
  path :'/oss/oss/?', //?wicket:interface=:3:searchrequestform:'+
 //   'theContainerRequest:requestView:1:popupLink::ILinkListener::',
  method : 'GET',
};

var root_page = {
  hostname: 'ossprovince.m-society.go.th',
  path :'/oss/oss/login/',
  method : 'GET',
  headers : {
  }
};


var req = http.request(root_page, function(res) {
 var content = '';
 var cookies = {};
 update_cookies(res,cookies);
 console.log(cookies);
 res.on('data',function(chunk) {  
  content+=chunk;
 });
 res.on('end', function() {
  var st = content.indexOf('<form');
  var en = content.indexOf('</form>');
  content = content.substr(st,en-st+7);
  content=content.replace(/&(nbsp);/g,' ');
  var form_obj = JSON.parse(parser.toJson(content));
  var action_path = form_obj.form.action;
  var login_query = querystring.stringify(login_data);
  root_page.path += action_path;
  root_page.method = 'POST';
  root_page.headers['Content-Length'] = login_query.length
  root_page.headers['Content-Type']='application/x-www-form-urlencoded';
  set_cookies(cookies,root_page);
  console.log(root_page);
  
  var login_req = http.request(root_page, function(login_res) {
   console.log('Status '+login_res.statusCode);
   update_cookies(login_res,cookies);
   cid_data['id']=s_req.params.id;
   cid_query_page.path+=querystring.stringify(cid_data);
   set_cookies(cookies,cid_query_page);
   console.log(cid_query_page);
   var pre_query = http.request(cid_query_page, function(pre_res) {
    console.log('Status '+pre_res.statusCode);
    content='';
    pre_res.on('data', function(chunk) {
     content+=chunk;
    });
    pre_res.on('end', function() {
    // console.log(content); 
     set_cookies(cookies,first_id_get);
     first_id_get['path']+=querystring.stringify(first_data);
     var get_content = http.request(first_id_get, function(get_res) {
      console.log('Status '+get_res.statusCode);
      try {
      var main_page = url.parse(get_res.headers.location);
      var main_request = http.request(main_page,function(main_res) {
       content='';
       main_res.on('data', function(chunk) {
        content+=chunk;
       });
       main_res.on('end', function() {
        content=content.replace(/&(nbsp);/g,' ');
        var page = JSON.parse(parser.toJson(content));
        s_res.json(page);
       });
      });
      main_request.end();
      } catch(err) {
        s_res.json({'success':false});
      }
     });
     get_content.end();
    });
   });
   pre_query.end();
  });
  login_req.write(login_query);
  login_req.end();
 });
});

req.end();

};

