var express = require('express');
var app = express();

var phpmyadmin_db = require('./phpmyadmin_db_new');
//var society_service = require('./test_society');

//app.get('/sc/id/:id', society_service.get_cid);
app.get('/', phpmyadmin_db.query);

app.listen(9012);
