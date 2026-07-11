const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);




/* =========================
   PORT (중요: 배포용 필수)
========================= */
const PORT = process.env.PORT || 3000;

/* =========================
   Socket.IO (배포 안전 설정)
========================= */
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

/* =========================
   Static files (프론트)
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   users store
========================= */
let users = {};
let serverPassword = null;
let hostname = null;

/* =========================
   Socket logic
========================= */
io.on("connection", (socket) => {

    console.log("user connected:", socket.id);

    socket.on("set nickname", (name) => {
        users[socket.id] = name;

        io.emit("user list", Object.values(users));
    });

    socket.on("chat message", (data) => {
        io.emit("chat message", data);
    });

    socket.on("disconnect", () => {

    delete users[socket.id];

        io.emit("user list", Object.values(users));

        if(Object.keys(users).length === 0){

            serverPassword = null;
            hostname = null;

            fs.writeFileSync(
                "whitelist.json",
                JSON.stringify([], null, 2)
            );

            console.log("모든 사용자가 퇴장했습니다.");
            console.log("서버 비밀번호 초기화");

        }

        console.log("user disconnected:", socket.id);

    });
});

/* =========================
   register&login
========================= */

app.use(express.json());

app.post("/register", (req, res) => {

    const { username, password } = req.body;

    const result = register(username, password);

    res.json(result);

});

app.post("/login", (req, res) => {

    const { username, password } = req.body;

    const result = login(username, password);

    res.json(result);

});

//------------register------------//

function register(username, password) {

    // 현재 저장된 사용자 불러오기
    const users = JSON.parse(
        fs.readFileSync("users.json", "utf8")
    );

    // 아이디 중복 검사
    const exists = users.find(
        user => user.username === username
    );

    if (exists) {
        return {
            success: false,
            message: "이미 존재하는 아이디입니다."
        };
    }

    // 새 사용자 추가
    users.push({
        username: username,
        password: password
    });

    // 파일에 다시 저장
    fs.writeFileSync(
        "users.json",
        JSON.stringify(users, null, 2)
    );

    return {
        success: true,
        message: "회원가입 성공"
    };
}
//--------------login-----------------//
function login(username, password) {

    // users.json 읽기
    const users = JSON.parse(
        fs.readFileSync("users.json", "utf8")
    );

    // 아이디 찾기
    const user = users.find(
        user => user.username === username
    );

    // 아이디가 없는 경우
    if (!user) {
        return {
            success: false,
            message: "존재하지 않는 아이디입니다."
        };
    }

    // 비밀번호 확인
    if (user.password !== password) {
        return {
            success: false,
            message: "비밀번호가 틀렸습니다."
        };
    }

    // 로그인 성공
    return {
        success: true,
        message: "로그인 성공"
    };
}

//-----------FirstOnline-----------//

function sethost(host, password) {

    console.log("sethost 호출됨");
    console.log("host =", host);
    console.log("password =", password);

    hostname = host;
    serverPassword = password;

    console.log("호스트:", hostname);
    console.log("서버 비밀번호:", serverPassword);

    return {
        success: true,
        message: "호스트 설정 완료"
    };
}

function isHost(username){
    return username === hostname;
}

app.get("/is-first-user", (req, res) => {

    const first = Object.keys(users).length === 0;

    res.json({
        first: first
    });

});

app.post("/sethost", (req, res) => {
    console.log(req.body);
    const { host, password } = req.body;
    const result = sethost(host, password);
    res.json(result);
});

app.post("/is-host", (req, res) => {
    const { username } = req.body;

    console.log("현재 사용자:", username);
    console.log("호스트:", hostname);

    res.json({
        isHost: username === hostname
    });

});

//-------------bringPassword-----------//

app.post("/check-server-password", (req, res) => {

    const { password } = req.body;

    if(password === serverPassword){
        res.json({
            success: true
        });
    }else{
        res.json({
            success: false,
            message: "비밀번호가 틀렸습니다."
        });
    }
});

function check_server_password(password) {
    if (password === serverPassword) {
        return {
            success: true
        };
    }

    return {
        success: false,
        message: "서버 비밀번호가 틀렸습니다."
    };
}

/* =========================
          whitelist
========================= */

app.post("/PlusWhitelist", (req, res) => {

    const { NWL } = req.body;

    const result = PlusWhitelist(NWL);

    res.json(result);

});

function PlusWhitelist(NWL){

    // 현재 저장된 사용자 불러오기
    const whitelist = JSON.parse(
        fs.readFileSync("whitelist.json", "utf8")
    );

    // 아이디 중복 검사
    const exists = whitelist.find(
        whitelist => whitelist.NWL === NWL
    );

    if (exists) {
        return {
            success: false,
            message: "이미 존재하는 아이디입니다."
        };
    }

    // 새 사용자 추가
    whitelist.push({
        NWL: NWL
    });

    // 파일에 다시 저장
    fs.writeFileSync(
        "whitelist.json",
        JSON.stringify(whitelist, null, 2)
    );

    return {
        success: true,
        message: "추가 성공"
    };
}

function MinusWhitelist(NWL) {

    // 화이트리스트 읽기
    let whitelist = JSON.parse(
        fs.readFileSync("whitelist.json", "utf8")
    );

    // 삭제할 사용자가 있는지 확인
    const exists = whitelist.find(
        whitelist => whitelist.NWL === NWL
    );

    if (!exists) {
        return {
            success: false,
            message: "존재하지 않는 아이디입니다."
        };
    }

    // 해당 사용자 제거
    whitelist = whitelist.filter(
        whitelist => whitelist.NWL !== NWL
    );

    // 다시 저장
    fs.writeFileSync(
        "whitelist.json",
        JSON.stringify(whitelist, null, 2)
    );

    return {
        success: true,
        message: "삭제 성공"
    };
}

app.post("/MinusWhitelist", (req, res) => {

    const { NWL } = req.body;

    const result = MinusWhitelist(NWL);

    res.json(result);

});

function GetWhitelist() {

    const whitelist = JSON.parse(
        fs.readFileSync("whitelist.json", "utf8")
    );

    return whitelist;
}

app.get("/GetWhitelist", (req, res) => {

    const whitelist = GetWhitelist();

    res.json(whitelist);

});

/* =========================
   server start (중요 수정)
========================= */
server.listen(PORT, () => {
    console.log("server running on port", PORT);
});