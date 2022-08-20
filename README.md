# CameraWebServer Description
Webserver project using a ESPCAM-32 with websocket broadcasting

Requirements:

Node.js
Arduino ESPCAM-32 Hardware

# Run the server
Go to ~/CameraWebServer/server and run the command:
cmd> node server.js

It will be listening on ports as following:

WS Server is listening at 8888
HTTP server listening at 8000
Connected to cam

# Local Connection
After starting the server with node
Type "localhost:8080/client" on your favorite browser

# Internet Connection
For this you need to enable your router's forwarding applications.
As it depends most frequently on the router's family I won't enter in details.
You need basically to enable the ports in your router for 8888 and 8000.
 
Make sure you know your WideLAN (Internet IP) going on www.whatismyipaddress.com
and type it on your browser:

http://255.255.255.255:8000/client

# Changing the IP address in the code
Go to the server directory

cmd> cd ~/CameraWebServer/server

Edit the IP address on port 8888 using the socket protocol
Example:

const WS_URL = 'ws://200.50.106.210:8888'; // Check on www.whatismyipaddress.com
