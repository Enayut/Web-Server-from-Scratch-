import * as net from 'net';
/*
function soRead(conn);
function soWrite(conn, data);

type TCPConn = {
    // the JS socket object
    socket: net.Socket;
    // from the 'error' event
    err: null|Error;
    // EOF, from the 'end' event
    ended: boolean;
    // the callbacks of the promise of the current read
    reader: null|{
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

socket.pause();      // pause the 'data' event
socket.resume();     // resume the 'data' event

type TCPlistener = {
    socket: net.Socket;
    err: null|Error;
    // the callbacks of the promise of the current read
    reader: null|{
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
}

*/

// create a wrapper from net.Socket => converting socket into a TCPConn object
function soInit(socket){
    const conn = {
        socket: socket, err: null, ended: false, reader: null,
    };
    socket.on('data', (data) => {
        console.assert(conn.reader);
        // pause the 'data' event until the next read.
        conn.socket.pause();
        // fulfill the promise of the current read.
        conn.reader.resolve(data);
        conn.reader = null;
    });
    socket.on('end', () => {
        // this also fulfills the current read.
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from(''));   // EOF
            conn.reader = null;
        }
    });
    socket.on('error', (err) => {
        // errors are also delivered to the current read.
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    });
    return conn;
}

//implementing soread function 
function soRead(conn){
    console.assert(!conn.reader) // no concurrent calls
    return new Promise((resolve, reject) => {
        // if the connection is not readable, complete the promise now.
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve(Buffer.from(''));   // EOF
            return;
        }
        //save callbacks
        conn.reader = {resolve: resolve, reject: reject};
        //resume
        conn.socket.resume();
    });
}
function soWrite(conn, data){
    console.assert(data.length > 0);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }

        conn.socket.write(data, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

const server = net.createServer({
    pauseOnConnect: true,   // required by `TCPConn`
});

async function newConn(socket){
    console.log('new connection', socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
    } catch (exc) {
        console.error('exception:', exc);
    } finally {
        socket.destroy();
    }
}

// echo server
async function serveClient(socket){
    const conn = soInit(socket);
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0) {
            console.log('end connection');
            break;
        }

        console.log('data', data);
        await soWrite(conn, data);
    }
}

function soListen(server, host, port){
    const listener = {
        server: server, err: null, host: host, port: port,
    }
    server.listen({ host: host, port: port });
    return listener;
}

function soAccept(listener){
    return new Promise((res,rej)=>{
        listener.server.on('connection', (socket)=>{
            newConn(socket);
            res();
        });
        listener.server.on('error', (err) => {
            listener.err = err;
            rej(err);
        });
    })
}

const listener = soListen(server, '127.0.0.1', 1234);

soAccept(listener).then(() => {
    console.log('server listening');
}).catch((err) => {
    console.error('Error starting server:', err);
});