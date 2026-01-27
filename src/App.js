import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

/**
 * 서버 주소 설정 (환경에 따라 수정 가능)
 */
const socket = io("http://localhost:3001", { transports: ["websocket"] });

function App() {
  // --- 상태 관리 (State) ---
  const [name, setName] = useState("");         // 사용자의 닉네임
  const [isJoined, setIsJoined] = useState(false); // 입장 여부
  const [players, setPlayers] = useState([]);     // 접속자 목록
  const [message, setMessage] = useState("");     // 입력 중인 메시지
  const [chatLog, setChatLog] = useState([]);     // 채팅 기록

  // --- 소켓 이벤트 리스너 등록 ---
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // [수정/추가] 게임 내부 진행 상태 및 개인 데이터 관리를 위한 State 추가
  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [myGameData, setMyGameData] = useState(null); // { role, word, category } 정보 저장
  const [showError, setShowError] = useState(""); // 상단 에러 알림 UI 텍스트 저장

  const chatEndRef = useRef(null); // 채팅창 하단 자동 스크롤을 위한 참조

  // --- 소켓 이벤트 리스너 등록 ---
  useEffect(() => {
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    // 서버로부터 플레이어 목록 업데이트 수신
    socket.on("update_players", (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    // 서버로부터 새 메시지 수신
    socket.on("receive_message", (data) => {
      setChatLog((prev) => [...prev, data]);
    });
    
    // [수정/추가] 서버로부터 개인별 게임 정보(역할, 단어)를 수신하는 리스너
    socket.on("game_start_info", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING"); // 게임 화면 모드로 전환
    });

    // [수정/추가] 전체 게임 상태 업데이트 리스너 (LOBBY <-> PLAYING)
    socket.on("update_game_status", (status) => setGameStatus(status));

    // [수정/추가] 서버 측에서 발생하는 에러(인원 부족, 준비 미완료 등) 알림 리스너
    socket.on("game_error", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000); // 3초 후 에러 메시지 자동 삭제
    });

    return () => {
      socket.off("update_players");
      socket.off("receive_message");
      socket.off("game_start_info");
      socket.off("game_error");
    };
  }, []);

  // 새 메시지가 올 때마다 스크롤 아래로 내리기
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  // --- 핸들러 함수 ---
  
  // 입장하기
  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim()) {
      socket.emit("join_room", name);
      setIsJoined(true);
    }
  };

  // 메시지 보내기
  const handleSendMessage = (e) => {
    e.preventDefault();
    // [수정/추가] 채팅 공백 전송 시 에러 UI 처리 로직
    if (!message.trim()) {
      setShowError("채팅 내용은 공백일 수 없습니다.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("send_message", { message, author: name });
    setMessage("");
  };

  // 준비 버튼 클릭
  const handleToggleReady = () => {
    socket.emit("toggle_ready");
  };

  // [수정/추가] 방장이 서버에 게임 시작을 요청하는 핸들러
  const handleStartGame = () => {
    socket.emit("start_game");
  };

  // --- 화면 렌더링 ---
  
  // 1. 입장 전 로비 화면
  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="p-8 bg-white rounded-xl shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-extrabold mb-6 text-center text-blue-600">Liar Game</h1>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              placeholder="닉네임을 입력하세요"
              className="w-full p-4 border-2 rounded-lg focus:border-blue-500 outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button className="w-full bg-blue-600 text-white p-4 rounded-lg font-bold hover:bg-blue-700">
              참가하기
            </button>
          </form>
        </div>
      </div>
    );
  }

// 2. 게임 대기실 및 채팅 화면
  const myInfo = players.find(p => p.id === socket.id);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-100 p-4 gap-4 overflow-hidden">
      {showError && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl z-50 animate-bounce">
          {showError}
        </div>
      )}

      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">
            {gameStatus === "LOBBY" ? "🏠 대기실" : "🎮 게임 중"}
          </h2>
          
          {gameStatus === "PLAYING" && myGameData && (
            <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100">
              <p className="text-sm text-blue-600 font-bold uppercase text-center">카테고리: {myGameData.category}</p>
              <div className="mt-2 text-center">
                <p className="text-xs text-gray-500">당신의 단어</p>
                <p className="text-2xl font-black text-blue-800">{myGameData.word}</p>
              </div>
            </div>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {players.map((p) => (
              <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-semibold">{p.name} {p.isHost && "👑"}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${p.isReady ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                  {p.isReady ? "READY" : "WAITING"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto">
          {myInfo?.isHost ? (
            <button 
              onClick={handleStartGame}
              className="w-full bg-red-500 text-white py-5 rounded-2xl font-black text-xl hover:bg-red-600 shadow-lg active:scale-95 transition-all"
            >
              게임 시작
            </button>
          ) : (
            // [수정/추가] 버튼 클릭 시 위에서 정의한 handleToggleReady를 호출하도록 변경했습니다.
            <button
              onClick={handleToggleReady}
              className={`w-full py-5 rounded-2xl font-black text-xl shadow-lg transition-all ${
                myInfo?.isReady ? "bg-gray-400 text-white" : "bg-green-500 text-white hover:bg-green-600"
              }`}
            >
              {myInfo?.isReady ? "준비 취소" : "준비 하기"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-800 text-white font-bold flex justify-between">
          <span>실시간 채팅</span>
          <span className="text-xs text-gray-400">{isConnected ? "연결됨" : "연결 끊김"}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatLog.map((chat) => (
            <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}>
              <span className="text-[10px] text-gray-400 mb-1">{chat.author}</span>
              <div className={`px-4 py-2 rounded-2xl max-w-xs ${
                chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-gray-100 text-gray-800 rounded-tl-none"
              }`}>
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-4 bg-gray-50 border-t flex gap-2">
          <input
            className="flex-1 p-3 border-2 rounded-xl focus:border-blue-400 outline-none"
            placeholder="메시지를 입력하세요..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors">
            전송
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
