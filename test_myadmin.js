var express = require('express');
var http = require('http');
var querystring = require('querystring');
var net = require('net');
var url = require('url');
var parser = require('xml2json');
var config = require('./config');


var login_data = {
  pma_username:config.php_config.user,
  pma_password:config.php_config.password,
  server:'1'
};

var sql_page = {
  hostname:'www.paihospital.com',
  path :'/pma/sql.php?',
  method : 'GET'
};

var sql_query = {
  db:'alldata',
  table:'co_activity',
  printview:'1',
  sql_query:'select * from alldata.co_activity',
  display_text:'F',
}; 

var root_page = {
  hostname: 'www.paihospital.com',
  path :'/pma/',
  method : 'GET',
};

var login_path = {
  hostname: 'www.paihospital.com',
  path :'/pma/index.php',
  method : 'POST',
  headers : {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
};

var set_cookies = function(cookies,options) {
  var cookie_str = '';
  var cookie_key = ['phpMyAdmin',
   'pma_length', 
   'pmaUser-1', 
   'pmaPass-1', 
   'pma_mcrypt_iv', 
   'PHPSESSID' 
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

var get_sql_result = function(content,callback) {
  var sql_json = [];
  var page = JSON.parse(parser.toJson(content));
  var table = page.html.body.div.table;
  var headers = table.thead.tr;
  var bodys = table.tbody;
  var key_list = [];
  headers.th.forEach(function(th) {
    key_list.push(th['$t']);
  });
  if(bodys.tr instanceof Array) {
    bodys.tr.forEach(function(row) {
      var tmp = {};
      row.td.forEach(function(col,idx) {
        tmp[key_list[idx]] = col['$t'];
      });
      sql_json.push(tmp);
    });
  } else {
    var tmp = {};
    bodys.tr.td.forEach(function(col,idx) {
      tmp[key_list[idx]] = col['$t'];
    });
    sql_json.push(tmp);
  }
  callback(sql_json);
  
};


var get_token = function(content,callback) {
  var page = JSON.parse(parser.toJson(content));
  var body = page.html.body;
  var form_list = body.div.form;
  form_list.forEach(function(form) {
    if(form.name == "login_form") {
      form.fieldset.forEach(function(field) {
        if(field.input instanceof Array) {
          field.input.forEach(function(input_f) {
            if(input_f.name == "token") {
              callback(input_f.value);
            }
          });
        }
      });
    }
  });
};


var req = http.request(root_page, function(res) {
  var content = '';
  var cookies = {};
  update_cookies(res,cookies);
  res.on('data', function(chunk) {
    content+=chunk;
  });
  res.on('end', function() {
    get_token(content,function(token) {
      login_data['token'] = token;
      var login_query = querystring.stringify(login_data);
      login_path.headers['Content-Length'] = login_query.length
      set_cookies(cookies,login_path);
      console.log(login_path);
      var login_req = http.request(login_path, function(login_res) {
        console.log('Status '+login_res.statusCode);
        update_cookies(login_res,cookies);
        var index_page = url.parse(login_res.headers.location);
        index_page['headers'] = {
          'Content-Type': 'application/x-www-form-urlencoded'
        };
        index_page.headers['Content-Length'] = login_query.length
        set_cookies(cookies,index_page);
        var token_key = querystring.parse(index_page.query).token;
        console.log(token_key);
       

        var index_req = http.request(index_page, function(index_res) {
          console.log('status :'+index_res.statusCode);
          update_cookies(index_res,cookies);
          set_cookies(cookies,sql_page);

          sql_query['token']=token_key;
          sql_page['path']+=querystring.stringify(sql_query);
          console.log(sql_page);
          var sql_req = http.request(sql_page, function(sql_res) {
            console.log('status SQL :'+sql_res.statusCode);
            var sql_content = '';
            sql_res.on('data', function(chunk) {
              sql_content+=chunk;
            });

            sql_res.on('end', function() {
             get_sql_result(sql_content,function(result) {
               console.log(result);
             });
            });
          });
          sql_req.end();
          index_res.on('data', function(chunk) {
          });

          index_res.on('end', function() {
          });
        });
        index_req.write(login_query);
        index_req.end();
        
      });
      login_req.write(login_query);
      login_req.end();
    }); 
  });
});

req.on('error', function(e) {
  console.log('Problem with request:'+e.message);
});

req.end();
