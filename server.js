var express = require("express")
  , bodyParser = require('body-parser')
  , request = require('requestretry')
  , querystring = require("querystring")
  , Q = require("q")
  , moment = require("moment");

  
var app = express();

app.use(bodyParser.json());

function do_get(url, cb) {
  request({
    url: url,
    json:true,

    // The below parameters are specific to Request-retry
    maxAttempts: 5,   // (default) try 5 times
    retryDelay: 500,  // (default) wait for .5s before trying again
    retryStrategy: request.RetryStrategies.NetworkError // retry on network errors
    }, function(err, response, body){
      // this callback will only be called when the request succeeded or after maxAttempts or on error
      if (err) {
        cb(err);
      } else {
        if (response.statusCode != 200) {          
          cb(response);
        } else {
          cb(null, body);
        }
      }
    });
}


app.get("/:project/snapshot/:key/:timestamp", function (req, res) {
  do_get("http://cif:5000/"+querystring.escape(req.params.project)+
         "/"+querystring.escape(req.params.key)+
         "."+querystring.escape(req.params.timestamp)+"?from=!&to=~", function (err, body) {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {      
      res.json(body);
    }
  });
});

function fill(a, b, s) {
  var res = [];
  for (var i=a; i<=b; i+=s) {
    res.push(i);
  }
  return res;
}

function validate_long(values) {
  for (var i=0; i<values.length; i++) {    
    if (isNan(parseInt(values[i]))) {
      return false;
    }
  }
  return true;
}

function get_year(ts) {
  return moment.unix(ts).year();
}

function align_3mo(ts) {
  var d = moment.unix(ts);
  d.startOf("quarter");
  return d;
}

function align_mo(ts) {
  var d = moment.unix(ts);
  d.startOf("month");
  return d;
}

function align_day(ts) {
  var d = moment.unix(ts);
  d.startOf("day");
  return d;
}

function align_hour(ts) {
  var d = moment.unix(ts);
  d.startOf("hour");
  return d;
}

/*
 * Query Parameters:
 * period = 1s | 5s | 15s | 1min | 5min | 15min | 1h | 12h | 1d | 1w | 1mo | 3mo | 1y
 * from = timestamp (inclusive)
 * to = timestamp (exclusive)
 */
app.get("/:project/timeseries/:key", function (req, res) {
  var key = req.query.period;
  var from = req.query.period;
  var to = req.query.period;
  if (!key || !from || !to) {
    res.sendStatus(400);
  } else {
    if (!validate_long([from, to])) {
      res.sendStatus(500);
    } else {
      from = parseInt(from);
      to = parseInt(to);
      var a;
      var b; 
      var s;
      if (key == "1y") {
        a  = Math.ceil(get_year(from) / 1000) * 1000
        b  = Math.ceil(get_year(to) / 1000) * 1000;
        s = 1000;
      } else
      if (key == "3mo" || key == "1mo" || key == "1w" || key == "1d") {
        a  = Math.ceil(get_year(from) / 10) * 10;
        b  = Math.ceil(get_year(to) / 10) * 10;
        s = 10;
      } else 
      if (key == "12h") {
        a  = Math.ceil(get_year(from));
        b  = Math.ceil(get_year(to));
        s = 1;
      } else
      if (key == "1h") {
        a = align_3mo(from);
        b = align_3mo(to);
        s = _3mo;
      } else
      if (key == "15min" || key == "5min") {
        a = align_mo(from);
        b = align_mo(to);
        s = _1mo;
      } else
      if (key == "1min" || key == "15s") {
        a = align_day(from);
        b = align_day(to);
        s = _1day;
      } else
      if (key == "5s" || key == "1s") {
        a = align_hour(from);
        b = align_hour(to);
        s = _1hour;
      } else {
        res.sendStatus(400);
      }
      Q.all(fill(a, b, s).map(function (x) {
        return Q.nfcall(do_get, 
          "http://cif:5000/"+querystring.escape(req.params.project)+
           "/timeseries."+querystring.escape(req.params.key)+
           "."+querystring.escape(x)+"?"+querystring.stringify({ from: from, to: to }));
      })).then(function (r) {
        res.json([].concat.apply([], r));
      }).fail(function (err) {
        console.log(err);
        res.sendStatus(500);
      });
    }
  }
});

app.listen(5000, function (err) {
  if (err) {
    console.log("Cannot start http server:", err);
  } else {
    console.log("Server started at port 5000");
  }
});
