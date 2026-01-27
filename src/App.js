import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

/**
 * 서버 주소 설정 (환경에 따라 수정 가능)
 */
const socket = io("http://localhost:3001", { transports: ["websocket"] });

function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(script);
  }, []);

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
  
  // [추가] 투표 및 결과 관련 상태
  const [votedCount, setVotedCount] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);

  const chatEndRef = useRef(null); // 채팅창 하단 자동 스크롤을 위한 참조

  // --- 소켓 이벤트 리스너 등록 ---
  useEffect(() => {
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    // 서버로부터 플레이어 목록 업데이트 수신
    socket.on("update_players", (data) => setPlayers(data));
    // 서버로부터 새 메시지 수신
    socket.on("receive_message", (data) => setChatLog((prev) => [...prev, data]));
    socket.on("join_success", () => setIsJoined(true));
    
    // 서버로부터 개인별 게임 정보(역할, 단어)를 수신하는 리스너
    socket.on("game_start_info", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING"); // 게임 화면 모드로 전환
      setGameResult(null);
      setHasVoted(false);
      setVotedCount(0);
    });

    // 전체 게임 상태 업데이트 리스너 (LOBBY <-> PLAYING)
    socket.on("update_game_status", (status) => setGameStatus(status));
    socket.on("update_turn", (id) => setCurrentTurnId(id));
    socket.on("update_voted_count", (count) => setVotedCount(count));
    
    socket.on("game_result", (result) => {
      setGameResult(result);
      setGameStatus("RESULT");
    });

    // 서버 측에서 발생하는 에러(인원 부족, 준비 미완료 등) 알림 리스너
    socket.on("game_error", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000); // 3초 후 에러 메시지 자동 삭제
    });

    return () => {
      socket.off("update_players");
      socket.off("receive_message");
      socket.off("join_success");
      socket.off("game_start_info");
      socket.off("update_game_status");
      socket.off("update_turn");
      socket.off("update_voted_count");
      socket.off("game_result");
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
    if (name.trim()) socket.emit("join_room", name);
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
  const handleToggleReady = () => socket.emit("toggle_ready");
  // 방장이 서버에 게임 시작을 요청하는 핸들러
  const handleStartGame = () => socket.emit("start_game");
  const handleNextTurn = () => socket.emit("next_turn");
  
  // [추가] 투표 핸들러
  const handleVote = (targetId) => {
    if (hasVoted) return;
    socket.emit("submit_vote", targetId);
    setHasVoted(true);
  };

// --- 화면 렌더링 ---
  
  // 1. 입장 전 로비 화면
  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
        <div className="p-10 bg-white rounded-3xl shadow-xl w-full max-w-md border border-slate-200 text-center">
          <h1 className="text-4xl font-black mb-8 text-blue-600">Liar Game</h1>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              placeholder="닉네임"
              className="w-full p-5 bg-slate-50 border-2 rounded-2xl focus:border-blue-500 outline-none font-bold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black text-xl hover:bg-blue-700 transition-all">
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
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 p-4 gap-4 overflow-hidden text-slate-800">
      {showError && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black">
          ⚠ {showError}
        </div>
      )}

      {/* 왼쪽 보드 */}
      <div className="w-full md:w-80 flex flex-col gap-4 shrink-0">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-xl font-black text-slate-700">
               {gameStatus === "LOBBY" ? "🏠 대기실" : gameStatus === "VOTING" ? "🗳 투표 중" : gameStatus === "RESULT" ? "🏆 결과" : "🎮 게임 중"}
             </h2>
             {gameStatus === "VOTING" && <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-md font-bold">{votedCount}/{players.length} 완료</span>}
          </div>
          
          {(gameStatus === "PLAYING" || gameStatus === "VOTING") && myGameData && (
            <div className="bg-indigo-50 p-5 rounded-2xl mb-6 border border-indigo-100 shadow-inner text-center">
              <p className="text-[10px] text-indigo-400 font-black mb-1 uppercase tracking-widest">Category: {myGameData.category}</p>
              <p className="text-3xl font-black text-indigo-900">{myGameData.word}</p>
            </div>
          )}

          {gameStatus === "RESULT" && gameResult && (
            <div className={`p-5 rounded-2xl mb-6 text-center border-4 ${gameResult.liar.id === socket.id ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
              <p className="text-xs font-bold mb-1">라이어의 정체는...</p>
              <p className="text-2xl font-black text-slate-800 mb-1">{gameResult.liar.name}</p>
              <p className="text-xs text-slate-400">라이어의 단어: {gameResult.liar.word}</p>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {players.map((p) => {
              const isTurn = currentTurnId === p.id;
              const voteCount = gameResult?.votes[p.id] || 0;
              return (
                <div 
                  key={p.id} 
                  className={`flex justify-between items-center p-4 rounded-2xl transition-all border-2 ${
                    isTurn ? "bg-amber-50 border-amber-400 shadow-md scale-[1.02]" : "bg-white border-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-600">{p.name} {p.isHost && "👑"}</span>
                    {isTurn && <span className="text-[10px] bg-amber-400 text-white px-1.5 py-0.5 rounded font-black">설명 중</span>}
                  </div>
                  
                  {gameStatus === "VOTING" && !hasVoted && p.id !== socket.id && (
                    <button 
                      onClick={() => handleVote(p.id)}
                      className="bg-rose-500 text-white text-[10px] px-3 py-1.5 rounded-lg font-black hover:bg-rose-600"
                    >
                      지목
                    </button>
                  )}
                  {gameStatus === "RESULT" && voteCount > 0 && (
                    <span className="bg-rose-100 text-rose-600 text-[10px] px-2 py-1 rounded-md font-black">
                      {voteCount}표
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0">
          {gameStatus === "LOBBY" ? (
            myInfo?.isHost ? (
              <button onClick={handleStartGame} className="w-full bg-rose-500 text-white py-5 rounded-[1.5rem] font-black text-xl hover:bg-rose-600 active:scale-95 shadow-lg">게임 시작</button>
            ) : (
              <button onClick={handleToggleReady} className={`w-full py-5 rounded-[1.5rem] font-black text-xl transition-all ${myInfo?.isReady ? "bg-slate-300 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                {myInfo?.isReady ? "준비 취소" : "준비 하기"}
              </button>
            )
          ) : gameStatus === "RESULT" && myInfo?.isHost ? (
            <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black text-xl hover:bg-blue-700">다시 게임 시작</button>
          ) : isMyTurn ? (
            <button onClick={handleNextTurn} className="w-full bg-amber-400 text-amber-900 py-5 rounded-[1.5rem] font-black text-xl hover:bg-amber-500 animate-pulse">설명 완료</button>
          ) : (
            <div className="w-full bg-white p-5 rounded-[1.5rem] border border-dashed border-slate-300 text-center">
              <p className="text-slate-400 text-sm font-bold animate-pulse">
                {gameStatus === "VOTING" ? (hasVoted ? "투표 완료! 대기 중..." : "라이어를 지목하세요!") : "경청 중..."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽 채팅 */}
      <div className="flex-1 flex flex-col bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full border-2 border-white ${isConnected ? "bg-emerald-400 shadow-[0_0_8px_#4ade80]" : "bg-rose-400"}`} />
            <span className="font-black text-slate-700">실시간 채팅</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
          {chatLog.map((chat) => (
            <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}>
              <span className="text-[10px] text-slate-400 font-black mb-1 px-2 uppercase">{chat.author}</span>
              <div className={`px-5 py-3 rounded-[1.5rem] max-w-[80%] break-all shadow-sm font-medium ${
                chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-slate-700 rounded-tl-none border border-slate-100"
              }`}>
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-6 bg-white border-t flex gap-3">
          <input
            className="flex-1 p-4 bg-slate-50 border-2 border-transparent focus:border-blue-400 focus:bg-white rounded-2xl outline-none font-bold"
            placeholder="메시지 입력..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-50">전송</button>
        </form>
      </div>
    </div>
  );
}

export default App;