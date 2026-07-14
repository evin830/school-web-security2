const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const io = new Server(server,{
    cors:{
        origin:"*",
        methods:["GET","POST"]
    }
});

app.use(express.static(path.join(__dirname,"public")));
app.use(express.json());

/* =========================
   Users
========================= */

const users={};
const USER_DB = "users.json";
const BLACKLIST_DB = "blacklist.json";

if(!fs.existsSync(BLACKLIST_DB)){
    fs.writeFileSync(BLACKLIST_DB,"[]");
}
if(!fs.existsSync(USER_DB)){
    fs.writeFileSync(USER_DB,"[]");
}

/* =========================
   Rooms
========================= */

const rooms={

    public:{
        id:"public",
        name:"공용 채팅방",
        code:"public",
        users:[]
    }

};

/* =========================
   Room List
========================= */
function loadUsers(){

    return JSON.parse(
        fs.readFileSync(USER_DB,"utf8")
    );

}

function saveUsers(data){

    fs.writeFileSync(
        USER_DB,
        JSON.stringify(data,null,2)
    );

}

function loadBlacklist(){

    return JSON.parse(
        fs.readFileSync(
            BLACKLIST_DB,
            "utf8"
        )
    );

}

function saveBlacklist(data){

    fs.writeFileSync(

        BLACKLIST_DB,

        JSON.stringify(
            data,
            null,
            2
        )

    );

}

function isBlacklisted(username){

    const blacklist=loadBlacklist();

    return blacklist.some(
        user=>user.username===username
    );

}

function addBlacklist(username){

    const blacklist=loadBlacklist();

    const exists=blacklist.find(

        user=>user.username===username

    );

    if(exists){

        return{

            success:false,
            message:"이미 등록되어 있습니다."

        };

    }

    blacklist.push({

        username

    });

    saveBlacklist(
        blacklist
    );

    return{

        success:true,
        message:"추가되었습니다."

    };

}

function removeBlacklist(username){

    let blacklist=loadBlacklist();

    const exists=blacklist.find(

        user=>user.username===username

    );

    if(!exists){

        return{

            success:false,
            message:"존재하지 않습니다."

        };

    }

    blacklist=blacklist.filter(

        user=>user.username!==username

    );

    saveBlacklist(
        blacklist
    );

    return{

        success:true,
        message:"삭제되었습니다."

    };

}

async function register(username,password){

    const db=loadUsers();

    const exists=db.find(
        user=>user.username===username
    );

    if(exists){

        return{

            success:false,
            message:"이미 존재하는 아이디입니다."

        };

    }

    const hash=await bcrypt.hash(password,10);

    db.push({

        username,

        password:hash

    });

    saveUsers(db);

    return{

        success:true,
        message:"회원가입 성공"

    };

}

async function login(username,password){

    const db=loadUsers();

    const user=db.find(
        user=>user.username===username
    );

    if(!user){

        return{

            success:false,
            message:"존재하지 않는 아이디입니다."

        };

    }

    const ok=await bcrypt.compare(

        password,

        user.password

    );

    if(!ok){

        return{

            success:false,
            message:"비밀번호가 틀렸습니다."

        };

    }

    return{

        success:true,

        admin:username==="admin",

        blacklisted:isBlacklisted(username),

        message:"로그인 성공"

    };

}

function emitRoomList(){

    const list = Object.values(rooms)
    .filter(room => room.id !== "public" && room.users.length > 0)
    .map(room => ({
        id: room.id,
        name: room.name,
        locked: room.code !== "",
        count: room.users.length
    }));

    io.emit("room list", list);

}

/* =========================
   User List
========================= */

function updateUserList(roomCode){

    const room=rooms[roomCode];

    if(!room) return;

    const list=room.users
        .map(id=>{

            const user=users[id];

            if(!user) return null;

            return{

                nickname:user.name,
                username:user.username

            };

        })
        .filter(Boolean);

    io.to(roomCode).emit("user list",list);

}

/* =========================
   Online Users
========================= */

function updateOnlineUsers(){

    const list = Object.values(users)
        .map(user => user.name)
        .filter(Boolean);


    io.emit(
        "online users",
        list
    );

}

/* =========================
   Leave Current Room
========================= */

function leaveCurrentRoom(socket){

    const user=users[socket.id];

    if(!user) return;

    const roomCode=user.room;

    if(!roomCode) return;

    socket.leave(roomCode);

    const room=rooms[roomCode];
    
    if(room){
    
        room.users = room.users.filter(
            id => id !== socket.id
        );
    
        updateUserList(roomCode);
    
        // public은 삭제하지 않음
        if(
            room.id !== "public" &&
            room.users.length === 0
        ){
            delete rooms[room.id];
        }
    
    }

    user.room=null;

    emitRoomList();

}

/* =========================
   Connection
========================= */

io.on("connection",(socket)=>{

    console.log("connected :",socket.id);

    emitRoomList();

    /* =========================
       Nickname
    ========================= */

    socket.on("set nickname",(data)=>{

        const username=data.username;
        const nickname=data.nickname.trim();
    
        if(isBlacklisted(username)){

            socket.emit(
                "nickname fail",
                "차단된 계정입니다."
            );

            return;

        }
    
        if(!nickname){
    
            socket.emit(
                "nickname fail",
                "닉네임을 입력하세요."
            );
    
            return;
    
        }
    
    
        if(nickname.length > 16){
    
            socket.emit(
                "nickname fail",
                "닉네임은 최대 16자입니다."
            );
    
            return;
    
        }
    
    
        // 중복 닉네임 검사
        const duplicate = Object.values(users)
            .some(user => user.name === nickname);
    
    
        if(duplicate){
    
            socket.emit(
                "nickname fail",
                "이미 사용 중인 닉네임입니다."
            );
    
            return;
    
        }
    
        users[socket.id]={
        
            username: username,

            name: nickname,

            room:"public"
        
        };
        
        
        socket.join("public");
        
        
        rooms.public.users.push(socket.id);
        
        
        updateUserList("public");
        
        updateOnlineUsers();
        
        
        socket.emit(
            "nickname success"
        );
    
    
    });

    /* =========================
       Create Room
    ========================= */

    socket.on("create room",(data)=>{
    
        if(!users[socket.id]) return;

         // 블랙리스트 검사
        if(isBlacklisted(users[socket.id].username)){

            socket.emit(
                "create fail",
                "차단된 계정은 방을 생성할 수 없습니다."
            );

            return;

        }
    
        const roomName = data.name.trim();
        const roomCode = data.code.trim();
    
        if(roomName.length === 0){
            socket.emit("create fail","방 이름을 입력하세요.");
            return;
        }
    
        // 비밀번호를 입력한 경우에만 숫자 검사
        if(roomCode !== "" && !/^\d+$/.test(roomCode)){
            socket.emit("create fail","방 코드는 숫자만 가능합니다.");
            return;
        }
    
        // 방 ID 생성 (중복되지 않게)
        const roomId=crypto.randomUUID();
    
        rooms[roomId] = {
            id: roomId,
            name: roomName,
            code: roomCode,   // 비밀번호
            users: []
        };
    
        emitRoomList();
    
        socket.emit("room created", roomId);
    
    });

    /* =========================
       Join Room
    ========================= */

    socket.on("join room",(data)=>{
    
        if(!users[socket.id]) return;

        // 블랙리스트 검사
        if(isBlacklisted(users[socket.id].username)){

            socket.emit(
                "join fail",
                "차단된 계정은 방에 입장할 수 없습니다."
            );

            return;

        }

        const room = rooms[data.id];
    
        if(!room){
            socket.emit("join fail");
            return;
        }
    
        // 비밀번호가 있는 방만 검사
        if(room.code !== "" && room.code !== data.code){
            socket.emit("join fail");
            return;
        }
    
        leaveCurrentRoom(socket);
    
        socket.join(room.id);
    
        users[socket.id].room = room.id;
    
        room.users.push(socket.id);
    
        updateUserList(room.id);
    
        emitRoomList();
    
        socket.emit("join success",{
            name: room.name,
            code: room.id
        });
    
    });

    /* =========================
       Leave Room
    ========================= */

    socket.on("leave room",()=>{

        if(!users[socket.id]) return;

        leaveCurrentRoom(socket);

    });

    /* =========================
       Chat
    ========================= */

    socket.on("chat message",(data)=>{

        console.log("=== chat message 이벤트 ===");
        console.log("socket.id :", socket.id);
        console.log("users[socket.id] :", users[socket.id]);

        if(!users[socket.id]) return;

        const user=users[socket.id];

        /* ---------- 공용 채팅 ---------- */

        if(data.room==="public"){

            io.to("public").emit("chat message",{

                room:"public",
                name:user.name,
                msg:data.msg,
                sender:socket.id

            });

            return;

        }

        /* ---------- 방 채팅 ---------- */

        if(!user.room) return;

        io.to(user.room).emit("chat message",{

            room:user.room,
            name:user.name,
            msg:data.msg,
            sender:socket.id

        });

    });

    /* =========================
   Whisper
========================= */

socket.on("whisper",(data)=>{

    if(!users[socket.id]) return;


    let targetId=null;


    // 닉네임 검색
    for(const id in users){

        if(users[id].name === data.target){

            targetId=id;
            break;

        }

    }


    if(!targetId){

        socket.emit(
            "whisper fail",
            "해당 사용자를 찾을 수 없습니다."
        );

        return;

    }


    const sender=users[socket.id];


    const packet={

        room:users[targetId].room || "public",

        name:sender.name+" → "+users[targetId].name,

        msg:data.msg,

        sender:socket.id,

        whisper:true

    };


    /*
        상대에게만 전송
    */

    io.to(targetId).emit(
        "chat message",
        packet
    );


    /*
        자기 자신에게도 표시
    */

    socket.emit(
        "chat message",
        packet
    );


});

    /* =========================
       Request Room List
    ========================= */

    socket.on("request rooms",()=>{

        emitRoomList();

    });

    /* =========================
       Request Online Users
    ========================= */
    
    socket.on("request online users",()=>{
    
        const list = Object.values(users)
            .map(user=>user.name)
            .filter(Boolean);
    
        socket.emit(
            "online users",
            list
        );
    
    });

    /* =========================
       Disconnect
    ========================= */

socket.on("disconnect",()=>{
    
        console.log("disconnect :",socket.id);
    
        leaveCurrentRoom(socket);
    
        delete users[socket.id];
    
        updateUserList("public");
    
        updateOnlineUsers();
    
        emitRoomList();
    
    });

});

/* =========================
   Server
========================= */

app.post("/register",async(req,res)=>{

    const{

        username,
        password

    }=req.body;

    res.json(
        await register(username,password)
    );

});

app.post("/login",async(req,res)=>{

    const{

        username,
        password

    }=req.body;

    res.json(
        await login(username,password)
    );

});

app.get("/GetBlacklist",(req,res)=>{

    res.json(
        loadBlacklist()
    );

});

app.post("/PlusBlacklist",(req,res)=>{

    const{
        username,
        admin
    }=req.body;

    if(admin!=="admin"){

        return res.json({

            success:false,
            message:"권한이 없습니다."

        });

    }

    res.json(
        addBlacklist(username)
    );

});

app.post("/MinusBlacklist",(req,res)=>{

    const{
        username,
        admin
    }=req.body;

    if(admin!=="admin"){

        return res.json({

            success:false,
            message:"권한이 없습니다."

        });

    }

    res.json(
        removeBlacklist(username)
    );

});

server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
