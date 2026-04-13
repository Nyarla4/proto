require('dotenv').config(); // 환경 변수 로드
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화 (제공해주신 환경변수 사용)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

let cachedWordDb = null;
let fetchPromise = null;

const fetchAndParseWords = async () => {
  try {
    const { data, error } = await supabase
      .from('words')
      .select('word, categories(name)');

    if (error) {
      console.error('Supabase 단어 DB 조회 에러:', error.message);
      return null; 
    }

    return data.reduce((acc, row) => {
      // Supabase 조인 결과 처리
      const category = row.categories?.name;
      if (!category) return acc;
      
      if (!acc[category]) acc[category] = [];
      acc[category].push(row.word);
      return acc;
    }, {});
    
  } catch (err) {
    console.error('단어 DB 통신 중 치명적 오류 발생:', err.message);
    return null;
  }
};

module.exports = {
  getWordDb: async (forceRefresh = false) => {
    if (!cachedWordDb || forceRefresh) {
      if (!fetchPromise) {
        fetchPromise = fetchAndParseWords().finally(() => { 
          fetchPromise = null; 
        });
      }
      
      const result = await fetchPromise;

      if (result) {
        cachedWordDb = result;
        console.log(`단어 DB 로딩 완료: ${Object.keys(cachedWordDb).length}개 카테고리 캐싱됨`);
      } else {
        console.error('단어 DB 로딩 실패: 데이터를 가져오지 못했습니다.');
        if (forceRefresh) throw new Error('DB_REFRESH_FAILED'); 
      }
    }
    
    return cachedWordDb; 
  }
};