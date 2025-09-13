const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const app = express();
app.use(express.static(__dirname + '/public'));

const WS_PORT  = 3000;
const HTTP_PORT = 8080;

const wsServer = new WebSocket.Server({ 
  port: WS_PORT,
  host: '0.0.0.0'
}, () => console.log(`WS Server is listening at ${WS_PORT}`));

let connectedClients = [];
wsServer.on('connection', (ws, req)=>{
    console.log('Connected to cam');
    connectedClients.push(ws);

    ws.on('message', data => {
        connectedClients.forEach((ws,i)=>{
            if(ws.readyState === ws.OPEN){
                ws.send(data);
            }else{
                connectedClients.splice(i ,1);
            }
        })
    });
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.get('/client',(req,res)=>res.sendFile(path.resolve(__dirname, './clientv2.html')));
app.listen(HTTP_PORT, '0.0.0.0', () => console.log(`HTTP server listening at ${HTTP_PORT}`));