var http = require('http');
var querystring = require('querystring');
var net = require('net');
var url = require('url');
var config = require('./config').php_config;
var parser = require('xml2js');

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
  try {
    var sql_json = [];
    content=content.replace(/\n/g,'');
    parser.parseString(content, function(err, page) {
    // var page = JSON.parse(parser.toJson(content));
      var table = page.html.body[0].div[0].table[0];
      var headers = table.thead[0].tr[0];
      var bodys = table.tbody[0];
      var key_list = [];
      if(headers.th instanceof Array) {
        headers.th.forEach(function(th) {
          key_list.push(th['_']);
        });
      } else {
        key_list.push(headers.th['_']);
      }
 
    if(bodys.tr instanceof Array) {
      bodys.tr.forEach(function(row) {
        if(row.td instanceof Array) {
          var tmp = {};
          row.td.forEach(function(col,idx) {
            tmp[key_list[idx]] = col['_'];
          });
          sql_json.push(tmp);
        } else {
          var tmp = {};
          tmp[key_list[0]] = row.td['_'];
          sql_json.push(tmp);
        }
      });
    } else {
      if(bodys.tr.td instanceof Array) {
        var tmp = {};
        bodys.tr.td.forEach(function(col,idx) {
          tmp[key_list[idx]] = col['_'];
        });
        sql_json.push(tmp);
      } else {
        var tmp = {};
        tmp[key_list[0]] = bodys.tr.td['_'];
        sql_json.push(tmp);
      }
    }
    callback(sql_json);
    }); // new parseString
  } catch(err) {
    callback({'error':err});
  }
};


var get_token = function(content,callback) {
  try {
   parser.parseString(content, function(err, page) {
    var body = page.html.body[0];
    var form_list = body.div[0].form[0];
    form_list.input.forEach(function(form) {
     var input = form['$'];
     if(input.name == "token") {
      callback(input.value);
     }
    });
   });
  } catch(err) {
    callback('abc');
  }
};


exports.query = function(p_req,p_res) { 
  var login_data = {
    pma_username:config.user,
    pma_password:config.password,
    server:'1'
  };

  var sql_page = {
    hostname:'www.paihospital.com',
    path :'/pma/sql.php?',
    method : 'GET'
  };

  var sql_query = {
    printview:'1',
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
        //console.log(login_path);
        var login_req = http.request(login_path, function(login_res) {
          //console.log('Status '+login_res.statusCode);
          update_cookies(login_res,cookies);
          var index_page = url.parse(login_res.headers.location);
          index_page['headers'] = {
            'Content-Type': 'application/x-www-form-urlencoded'
          };
          index_page.headers['Content-Length'] = login_query.length
          set_cookies(cookies,index_page);
          var token_key = querystring.parse(index_page.query).token;
          //console.log(token_key);
       
          var index_req = http.request(index_page, function(index_res) {
            //console.log('status :'+index_res.statusCode);
            update_cookies(index_res,cookies);
            set_cookies(cookies,sql_page);

            sql_query['token']=token_key;
            sql_query['sql_query']=p_req.query.sql_query;
            sql_page['path']='/pma/sql.php?'+querystring.stringify(sql_query);
            
            //console.log(sql_page);
            var sql_req = http.request(sql_page, function(sql_res) {
              //console.log('status SQL :'+sql_res.statusCode);
              var sql_content = '';
              sql_res.on('data', function(chunk) {
                sql_content+=chunk;
              });

              sql_res.on('end', function() {
               get_sql_result(sql_content,function(result) {
                 console.log('Rows :'+result.length);
                 if(p_req.query.callback) {
                   var callback=p_req.query.callback+'(';
                   callback+=JSON.stringify(result);
                   callback+=');';
                   p_res.send(callback);
                 } else {
                   p_res.json(result);
                 }
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
};


/*
query({
 'query':{
  'sql_query':'select * from alldata.co_title limit 0, 1'
 }},{
  json: function(message) {
   console.log(message);
  }
});
*/


