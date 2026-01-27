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
  
  // 게임 내부 진행 상태 및 개인 데이터 관리를 위한 State 추가
  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [myGameData, setMyGameData] = useState(null); // { role, word, category } 정보 저장
  const [showError, setShowError] = useState(""); // 상단 에러 알림 UI 텍스트 저장

  const [currentTurnId, setCurrentTurnId] = useState(""); 
  const [isAllTurnsFinished, setIsAllTurnsFinished] = useState(false); 

  const chatEndRef = useRef(null); // 채팅창 하단 자동 스크롤을 위한 참조

  // --- 소켓 이벤트 리스너 등록 ---
  useEffect(() => {
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    // 서버로부터 플레이어 목록 업데이트 수신
    socket.on("update_players", (data) => setPlayers(data));
    // 서버로부터 새 메시지 수신
    socket.on("receive_message", (data) => setChatLog((prev) => [...prev, data]));
    
    // 서버로부터 개인별 게임 정보(역할, 단어)를 수신하는 리스너
    socket.on("game_start_info", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING"); // 게임 화면 모드로 전환
      setIsAllTurnsFinished(false);
    });

    // 전체 게임 상태 업데이트 리스너 (LOBBY <-> PLAYING)
    socket.on("update_game_status", (status) => setGameStatus(status));

    socket.on("update_turn", (turnPlayerId) => {
      setCurrentTurnId(turnPlayerId);
    });

    socket.on("all_turns_finished", () => {
      setIsAllTurnsFinished(true);
      setCurrentTurnId("");
    });

    // 서버 측에서 발생하는 에러(인원 부족, 준비 미완료 등) 알림 리스너
    socket.on("game_error", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000); // 3초 후 에러 메시지 자동 삭제
    });

    return () => {
      socket.off("update_players");
      socket.off("receive_message");
      socket.off("game_start_info");
      socket.off("update_game_status");
      socket.off("update_turn");
      socket.off("all_turns_finished");
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
    // 채팅 공백 전송 시 에러 UI 처리 로직
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

  // 방장이 서버에 게임 시작을 요청하는 핸들러
  const handleStartGame = () => {
    socket.emit("start_game");
  };

  const handleNextTurn = () => {
    socket.emit("next_turn");
  };

// --- 화면 렌더링 ---
  
  // 1. 입장 전 로비 화면
  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-gray-800 font-sans">
        <div className="p-8 bg-white rounded-xl shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-extrabold mb-6 text-center text-blue-600 tracking-tighter">Liar Game</h1>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              placeholder="닉네임을 입력하세요"
              className="w-full p-4 border-2 rounded-lg focus:border-blue-500 outline-none transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button className="w-full bg-blue-600 text-white p-4 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md active:scale-95">
              참가하기
            </button>
          </form>
        </div>
      </div>
    );
  }

// 2. 게임 대기실 및 채팅 화면
  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-100 p-4 gap-4 overflow-hidden text-gray-800 font-sans">
      {showError && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-8 py-3 rounded-full shadow-2xl z-50 animate-bounce font-black">
          ⚠ {showError}
        </div>
      )}

      <div className="w-full md:w-1/3 flex flex-col gap-4 min-h-0">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
             <h2 className="text-xl font-bold">
               {gameStatus === "LOBBY" ? "🏠 대기실" : "🎮 게임 진행 중"}
             </h2>
             {/* 게임 상태를 명확히 알리는 텍스트 추가 */}
             {gameStatus === "PLAYING" && (
               <span className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded-md font-black animate-pulse uppercase">
                 IN GAME
               </span>
             )}
          </div>
          
          {gameStatus === "PLAYING" && myGameData && (
            <div className="bg-blue-50 p-5 rounded-2xl mb-4 border border-blue-100 shadow-inner">
              <p className="text-xs text-blue-500 font-bold text-center mb-1">카테고리: {myGameData.category}</p>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 font-semibold mb-1">당신의 제시어</p>
                {/* 라이어도 시민과 완전히 동일하게 보이도록 '당신은 라이어입니다' 문구 삭제 */}
                <p className="text-3xl font-black text-slate-800 tracking-tight">{myGameData.word}</p>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {players.map((p) => {
              const isTurnPlayer = currentTurnId === p.id;
              return (
                <div 
                  key={p.id} 
                  className={`flex justify-between items-center p-3 rounded-xl transition-all border-2 ${
                    isTurnPlayer 
                    ? "bg-yellow-50 border-yellow-400 ring-4 ring-yellow-100 ring-opacity-50" 
                    : p.id === socket.id ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{p.name} {p.isHost && "👑"}</span>
                    {isTurnPlayer && <span className="animate-pulse text-[10px] bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-md font-black">말하는 중</span>}
                  </div>
                  {gameStatus === "LOBBY" ? (
                    <span className={`text-[9px] px-2 py-1 rounded-full font-black ${p.isReady ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-400"}`}>
                      {p.isReady ? "READY" : "WAITING"}
                    </span>
                  ) : (
                    <span className="text-[9px] px-2 py-1 rounded-full bg-blue-600 text-white font-black shadow-sm">
                      PLAYING
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto shrink-0">
          {gameStatus === "LOBBY" ? (
            myInfo?.isHost ? (
              <button 
                onClick={handleStartGame}
                className="w-full bg-red-500 text-white py-5 rounded-2xl font-black text-xl hover:bg-red-600 shadow-lg active:scale-95 transition-all"
              >
                게임 시작
              </button>
            ) : (
            // 버튼 클릭 시 위에서 정의한 handleToggleReady를 호출하도록 변경했습니다.
              <button
                onClick={handleToggleReady}
                className={`w-full py-5 rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 ${
                  myInfo?.isReady ? "bg-gray-400 text-white shadow-none" : "bg-green-500 text-white hover:bg-green-600 shadow-green-100"
                }`}
              >
                {myInfo?.isReady ? "준비 취소" : "준비 하기"}
              </button>
            )
          ) : (
            <div className="space-y-2">
              {isMyTurn && (
                <button 
                  onClick={handleNextTurn}
                  className="w-full bg-yellow-400 text-yellow-900 py-5 rounded-2xl font-black text-xl hover:bg-yellow-500 shadow-xl animate-pulse active:scale-95"
                >
                  설명 완료 (다음 차례)
                </button>
              )}
              {isAllTurnsFinished && myInfo?.isHost && (
                <button 
                  onClick={handleStartGame}
                  className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-blue-700 shadow-lg active:scale-95"
                >
                  새 게임 시작
                </button>
              )}
              {!isMyTurn && !isAllTurnsFinished && (
                <div className="w-full bg-white p-5 rounded-2xl border border-dashed border-gray-300 text-center shadow-inner">
                  <p className="text-gray-400 text-sm font-bold animate-pulse">상대방의 설명을 경청하세요...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-0">
        <div className="p-4 bg-slate-800 text-white font-bold flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            {/* 연결 상태 점이 더 잘 보이도록 강조 */}
            <div className={`w-3 h-3 rounded-full border-2 border-slate-700 ${isConnected ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-red-400"}`}></div>
            <span className="text-sm">실시간 채팅</span>
          </div>
          <span className="text-[10px] font-normal text-slate-400 italic">메시지 전송 시 엔터 가능</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {chatLog.map((chat) => (
            <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}>
              <span className="text-[10px] text-gray-400 mb-1 font-bold px-1">{chat.author}</span>
              <div className={`px-4 py-2 rounded-2xl max-w-[85%] break-all shadow-sm ${
                chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-gray-800 rounded-tl-none border border-gray-100"
              }`}>
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t flex gap-2 shrink-0">
          <input
            className="flex-1 p-3 bg-gray-50 border-2 border-transparent focus:border-blue-400 focus:bg-white rounded-xl outline-none font-medium transition-all"
            placeholder="메시지를 입력하세요..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md">
            전송
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;