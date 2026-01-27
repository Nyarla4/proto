import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

/**
 * 서버 주소 설정
 */
const socket = io("http://localhost:3001", { transports: ["websocket"] });

function App() {
  // 스타일 로드
  useEffect(() => {
    const scriptId = "tailwind-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // --- 상태 관리 (State) ---
  const [name, setName] = useState("");         // 사용자의 닉네임
  const [isJoined, setIsJoined] = useState(false); // 입장 여부
  const [players, setPlayers] = useState([]);     // 접속자 목록
  const [message, setMessage] = useState("");     // 입력 중인 메시지
  const [chatLog, setChatLog] = useState([]);     // 채팅 기록

  // --- 소켓 상태 및 게임 데이터 ---
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  // 게임 내부 진행 상태 및 개인 데이터 관리를 위한 State 추가
  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [myGameData, setMyGameData] = useState(null); // { role, word, category }
  const [showError, setShowError] = useState("");   // 에러 알림 UI

  const [currentTurnId, setCurrentTurnId] = useState(""); 
  
  // [추가] 투표 및 결과 관련 상태
  const [votedCount, setVotedCount] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  
  // 라이어 정답 맞추기 관련 상태
  const [guessWord, setGuessWord] = useState("");

  const chatEndRef = useRef(null); // 채팅창 하단 자동 스크롤

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
      setGuessWord("");
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
  
  // 투표 핸들러
  const handleVote = (targetId) => {
    if (hasVoted) return;
    socket.emit("submit_vote", targetId);
    setHasVoted(true);
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    if (guessWord.trim()) {
      socket.emit("submit_guess", guessWord);
    }
  };

// --- 화면 렌더링 ---

  // 1. 입장 전 로비 화면
  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <h1 className="text-4xl font-bold mb-8 text-blue-600">Liar Game</h1>
        <form onSubmit={handleJoin} className="space-y-4 w-64">
          <input
            type="text"
            placeholder="닉네임 입력"
            className="w-full p-3 border border-gray-300 rounded"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">입장하기</button>
        </form>
      </div>
    );
  }

  // 2. 메인 게임/채팅 화면
  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id;
  const isLiar = myGameData?.role === "LIAR";

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-100 p-4 gap-4 overflow-hidden">
      {showError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {showError}
        </div>
      )}

      {/* 왼쪽 사이드바: 플레이어 리스트 및 정보 */}
      <div className="w-full md:w-1/4 flex flex-col gap-4 overflow-hidden">
        <div className="bg-white p-4 rounded-xl shadow-md flex-1 overflow-hidden flex flex-col">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">
            {gameStatus === "LOBBY" ? "대기실" : 
             gameStatus === "VOTING" ? "투표 시간" : 
             gameStatus === "LIAR_GUESS" ? "라이어의 정답 확인" : "게임 결과"}
          </h2>
          
          {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-xs text-blue-400">카테고리: {myGameData.category}</p>
              <p className="text-2xl font-black text-blue-700">{myGameData.word}</p>
              {/* <p className="text-xs mt-1 font-bold">{isLiar ? "당신은 라이어입니다!" : "시민입니다."}</p> */}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2">
            {players.map((p) => (
              <div key={p.id} className={`p-3 rounded-lg flex justify-between items-center ${currentTurnId === p.id ? "bg-yellow-100 border-2 border-yellow-400" : "bg-gray-50 border border-gray-200"}`}>
                <span className="font-medium text-sm">{p.name} {p.isHost && "👑"}</span>
                {gameStatus === "VOTING" && !hasVoted && p.id !== socket.id && (
                  <button onClick={() => handleVote(p.id)} className="text-xs bg-red-500 text-white px-2 py-1 rounded">지목</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 액션 버튼 영역 */}
        <div className="bg-white p-4 rounded-xl shadow-md">
          {gameStatus === "LOBBY" ? (
            myInfo?.isHost ? (
              <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">게임 시작</button>
            ) : (
              <button onClick={handleToggleReady} className={`w-full py-3 rounded-lg font-bold ${myInfo?.isReady ? "bg-gray-300" : "bg-green-500 text-white"}`}>
                {myInfo?.isReady ? "준비 완료" : "준비하기"}
              </button>
            )
          ) : gameStatus === "LIAR_GUESS" ? (
            isLiar ? (
              <form onSubmit={handleSubmitGuess} className="space-y-2">
                <p className="text-xs font-bold text-red-500 text-center">제시어를 맞춰보세요!</p>
                <input 
                  type="text" 
                  value={guessWord} 
                  onChange={(e) => setGuessWord(e.target.value)}
                  placeholder="정답 입력"
                  className="w-full p-2 border border-gray-300 rounded"
                />
                <button className="w-full bg-red-600 text-white py-2 rounded font-bold">정답 제출</button>
              </form>
            ) : (
              <p className="text-center font-bold text-gray-500 animate-pulse">라이어가 정답을 생각 중입니다...</p>
            )
          ) : gameStatus === "RESULT" ? (
            myInfo?.isHost && <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">다시 하기</button>
          ) : isMyTurn ? (
            <button onClick={handleNextTurn} className="w-full bg-yellow-400 text-yellow-900 py-3 rounded-lg font-bold hover:bg-yellow-500">설명 완료</button>
          ) : (
            <p className="text-center text-gray-400 text-sm italic">대기 중...</p>
          )}
        </div>
      </div>

      {/* 오른쪽 메인: 채팅창 및 결과 */}
      <div className="flex-1 bg-white rounded-xl shadow-md flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {gameStatus === "RESULT" && gameResult && (
            <div className="mb-6 p-4 bg-white border-2 border-blue-400 rounded-xl text-center shadow-lg animate-bounce">
              <h3 className="text-xl font-bold text-blue-600">게임 종료</h3>
              <p className="text-lg mt-2">라이어: <span className="font-black">{gameResult.liar.name}</span></p>
              <p className="font-bold text-gray-700">제시어: {gameResult.liar.word}</p>
              <div className="mt-4 p-2 bg-blue-600 text-white rounded-lg font-black italic">
                {gameResult.winner === 'CITIZEN' ? "시민 승리!" : "라이어 승리!"}
              </div>
            </div>
          )}
          {chatLog.map((chat) => (
            <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}>
              <span className="text-[10px] text-gray-500 mb-1">{chat.author}</span>
              <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${
                chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white border border-gray-200 text-gray-800 rounded-tl-none"
              }`}>
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
          <input
            className="flex-1 p-2 border border-gray-300 rounded outline-none focus:border-blue-500"
            placeholder="메시지 입력..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-6 py-2 rounded font-bold">전송</button>
        </form>
      </div>
    </div>
  );
}

export default App;