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
    if (isNaN(parseInt(values[i]))) {
      return false;
    }
  }
  return true;
}

function get_year(ts) {
  return moment.unix(ts).year();
}

function get_month(ts) {
  return moment.unix(ts).month();
}

function get_quarter(ts) {
  return Math.floor(get_month(ts)/3);
}

function align_3mo(ts) {
  var d = moment.unix(ts);
  d.startOf("quarter");
  return d.unix();
}

function align_mo(ts) {
  var d = moment.unix(ts);
  d.startOf("month");
  return d.unix();
}

function align_day(ts) {
  var d = moment.unix(ts);
  d.startOf("day");
  return d.unix();
}

function align_hour(ts) {
  var d = moment.unix(ts);
  d.startOf("hour");
  return d.unix();
}

/*
 * Query Parameters:
 * period = 1s | 5s | 15s | 1min | 5min | 15min | 1h | 12h | 1d | 1w | 1mo | 3mo | 1y
 * from = timestamp (inclusive)
 * to = timestamp (exclusive)
 */
app.get("/:project/timeseries/:key", function (req, res) {
  var period = req.query.period;
  var from = req.query.from;
  var to = req.query.to;
  if (!period || !from || !to) {
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
      // Millenium (1000, 2000, ...)
      if (period == "1y") {
        a  = Math.floor(get_year(from) / 1000) * 1000
        b  = Math.floor(get_year(to) / 1000) * 1000;
        s = 1000;
      } else
      // Decade (2000, 2010, 2020, ...)
      if (period == "3mo" || period == "1mo" || period == "1w" || period == "1d") {
        a  = Math.floor(get_year(from) / 10) * 10;
        b  = Math.floor(get_year(to) / 10) * 10;
        s = 10;
      } else
      // Year (2014, 1015, ...)
      if (period == "12h") {
        a  = Math.floor(get_year(from));
        b  = Math.floor(get_year(to));
        s = 1;
      } else
      // Quarter aligned month (2015*12+0, 2015*12+3, ...)
      if (period == "1h") {
        a = Math.floor(get_year(from))*12+get_quarter(from)*3;
        b = Math.floor(get_year(to))*12+get_quarter(to)*3;
        s = 3;
      } else
      // Month (2015*12+0, 2015*12+1, ...)
      if (period == "15min" || period == "5min") {
        a = Math.floor(get_year(from))*12+get_month(from);
        b = Math.floor(get_year(to))*12+get_month(to);
        s = 1;
      } else
      // Day start in seconds
      if (period == "1min" || period == "15s") {
        a = align_day(from);
        b = align_day(to);
        s = 24*3600;
      } /* TODO else
      if (period == "5s" || period == "1s") {
        a = align_hour(from);
        b = align_hour(to);
        s = _1hour;
      } */ else {
        res.sendStatus(400);
      }
      Q.all(fill(a, b, s).map(function (x) {
        var url = "http://cif:5000/"+querystring.escape(req.params.project)+
           "/"+querystring.escape(req.params.key)+
           "."+querystring.escape(x)+"?"+querystring.stringify({ from: from, to: to });
        console.log("url: "+url);
        return Q.nfcall(do_get, url).then(function (r) {
          // temporary hack to switch to the next version seamlessly
          if (r.length == 0) {
            var url = "http://cif:5000/"+querystring.escape(req.params.project)+
               "/timeseries."+querystring.escape(req.params.key)+
               "."+querystring.escape(x)+"?"+querystring.stringify({ from: from, to: to });
            console.log("url: "+url);
            return Q.nfcall(do_get, url);
          } else {
            return r;
          }
        });
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


/*
from = 1433116000;
to =   1434000000;
    

a = Math.floor(get_year(from) / 10) * 10;
b = Math.floor(get_year(to) / 10) * 10;
s = 10;

console.log("a="+a+" b="+b);
  
var url = "http://cif:5000/"+querystring.escape("pldt")+
           "/timeseries."+querystring.escape("snr.phl.1d")+
           "."+querystring.escape(a)+"?"+querystring.stringify({ from: from, to: to });
           
console.log(url);           
*/
