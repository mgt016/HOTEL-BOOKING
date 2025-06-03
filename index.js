const express =  require('express');



let app = express();



var port = 2000;



const server = app.listen(port, function () {
    console.log("SERVER RUNNING ON PORT : " + port);
});