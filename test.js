var ProtoBuf = require("protobufjs")

var builder = ProtoBuf.loadProtoFile("gator.proto")
  , Metric = builder.build("Metric");

var b = Metric.encode({ "numericValue": { "min": 1, "max": 2, "sum": 3, "cnt": 4, "stddev": 0, "minKey": "a", "maxKey": "b" } });
var d = Metric.decode(b);

console.log(d);
console.log(d.numericValue.cnt.toNumber());
