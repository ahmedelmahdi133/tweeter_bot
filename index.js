require('dotenv').config();
const { TwitterApi, ETwitterApiError } = require('twitter-api-v2');
const fs = require('fs');
const readline = require('readline');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const keywords = ['مطلوب معلمين']; // عدل الكلمات كما تريد
const TOKEN_PATH = './token.json';
const LAST_ID_PATH = './last_id.txt';

// إضافة route للـ callback
app.get('/callback', (req, res) => {
  const { code, state } = req.query;
  if (code && state) {
    res.send(`
      <html>
        <body>
          <h2>تم استلام الكود بنجاح!</h2>
          <p>يمكنك الآن إغلاق هذه الصفحة.</p>
          <script>
            // إرسال الكود إلى البوت
            fetch('/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, state })
            });
          </script>
        </body>
      </html>
    `);
  } else {
    res.status(400).send('خطأ في البيانات المستلمة');
  }
});

app.use(express.json());

// route لاستقبال بيانات التفويض
app.post('/auth', async (req, res) => {
  const { code, state } = req.body;
  try {
    const twitterClient = new TwitterApi({
      clientId,
      clientSecret,
    });
    
    const { codeVerifier } = JSON.parse(fs.readFileSync('./oauth_state.json', 'utf8'));
    
    const { client: userClient, accessToken, refreshToken, expiresIn, scope, tokenType } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri,
    });
    
    const tokenData = {
      accessToken,
      refreshToken,
      expiresIn,
      scope,
      tokenType
    };
    
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
    console.log('تم حفظ التوكن بنجاح من Railway!');
    
    res.json({ success: true, message: 'تم حفظ التوكن بنجاح' });
  } catch (err) {
    console.error('فشل في معالجة التفويض:', err);
    res.status(500).json({ error: err.message });
  }
});

// route للتحكم في البوت
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>بوت تويتر</h1>
        <p>البوت يعمل بنجاح!</p>
        <p>للتفويض: <a href="/auth-url">اضغط هنا</a></p>
      </body>
    </html>
  `);
});

app.get('/auth-url', (req, res) => {
  const twitterClient = new TwitterApi({
    clientId,
    clientSecret,
  });
  
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    redirectUri,
    { scope: [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access',
    ] }
  );
  
  fs.writeFileSync('./oauth_state.json', JSON.stringify({ codeVerifier, state }));
  
  res.send(`
    <html>
      <body>
        <h2>رابط التفويض</h2>
        <p><a href="${url}">اضغط هنا للتفويض</a></p>
      </body>
    </html>
  `);
});

async function getUserClient() {
  let token;
  if (fs.existsSync(TOKEN_PATH)) {
    token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  }

  const twitterClient = new TwitterApi({
    clientId,
    clientSecret,
  });

  if (!token) {
    // لا يوجد توكن، اطبع رابط التفويض فقط
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
      redirectUri,
      { scope: [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ] }
    );
    fs.writeFileSync('./oauth_state.json', JSON.stringify({ codeVerifier, state }));
    console.log('افتح هذا الرابط في المتصفح وسجل الدخول ثم انسخ الرابط النهائي بعد التفويض:');
    console.log(url);
    // استخدم Promise مع readline
    await new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('بعد التفويض، الصق الرابط النهائي هنا:\n', async (redirectedUrl) => {
        rl.close();
        try {
          const urlObj = new URL(redirectedUrl.trim());
          const code = urlObj.searchParams.get('code');
          const stateFromUrl = urlObj.searchParams.get('state');
          const { codeVerifier, state } = JSON.parse(fs.readFileSync('./oauth_state.json', 'utf8'));
          if (state !== stateFromUrl) {
            console.error('State mismatch. Please try again.');
            process.exit(1);
          }
          const { client: userClient, accessToken, refreshToken, expiresIn, scope, tokenType } = await twitterClient.loginWithOAuth2({
            code,
            codeVerifier,
            redirectUri,
          });
          const tokenData = {
            accessToken,
            refreshToken,
            expiresIn,
            scope,
            tokenType
          };
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
          console.log('تم حفظ التوكن بنجاح. البيانات المحفوظة:');
          console.log({ expiresIn, scope, tokenType });
          console.log('أعد تشغيل البوت.');
          resolve();
          process.exit(0);
        } catch (err) {
          console.error('فشل في معالجة رابط التفويض:', err);
          reject(err);
          process.exit(1);
        }
      });
    });
    return;
  } else {
    // استخدم refreshOAuth2Token لتحديث التوكن
    try {
      const { client: userClient, accessToken, refreshToken, expiresIn, scope, tokenType } = await twitterClient.refreshOAuth2Token(token.refreshToken);
      const tokenData = {
        accessToken,
        refreshToken,
        expiresIn,
        scope,
        tokenType
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
      console.log('تم تحديث التوكن بنجاح.');
      return userClient;
    } catch (err) {
      console.error('فشل في تحديث التوكن:', err);
      // احذف التوكن القديم وابدأ التفويض من جديد
      fs.unlinkSync(TOKEN_PATH);
      fs.unlinkSync('./oauth_state.json');
      console.log('سيتم إعادة التفويض. أعد تشغيل البوت.');
      process.exit(1);
    }
  }
}

function buildQuery(keywords) {
  return keywords.join(' OR ');
}

async function searchAndReply(userClient, sinceId) {
  const query = buildQuery(keywords);
  const params = {
    query,
    'tweet.fields': 'author_id,conversation_id',
    max_results: 10,
  };
  if (sinceId) params.since_id = sinceId;
  try {
    const res = await userClient.v2.get('tweets/search/recent', params);
    if (!res.data || !Array.isArray(res.data)) return sinceId;
    const tweets = res.data.reverse();
    let newSinceId = sinceId;
    for (const tweet of tweets) {
      if (!tweet.text) continue;
      const found = keywords.find(word => tweet.text.includes(word));
      if (found) {
        try {
          await userClient.v2.reply(
            '‏موجود معلمات ومعلمين علي أعلي مستوي من الخبرة للتواصل 0546745604',
            tweet.id
          );
          console.log(`رديت على: ${tweet.text}`);
        } catch (e) {
          if (e instanceof ETwitterApiError) {
            console.error('Twitter API error:', e.data);
          } else {
            console.error(e);
          }
        }
      }
      if (!newSinceId || BigInt(tweet.id) > BigInt(newSinceId)) {
        newSinceId = tweet.id;
      }
    }
    return newSinceId;
  } catch (e) {
    console.error('خطأ في البحث:', e);
    return sinceId;
  }
}

async function startPolling() {
  const userClient = await getUserClient();
  if (!userClient) return;
  let sinceId = fs.existsSync(LAST_ID_PATH) ? fs.readFileSync(LAST_ID_PATH, 'utf8') : undefined;
  setInterval(async () => {
    const newSinceId = await searchAndReply(userClient, sinceId);
    if (newSinceId && newSinceId !== sinceId) {
      sinceId = newSinceId;
      fs.writeFileSync(LAST_ID_PATH, sinceId);
    }
  }, 16 * 60 * 1000); // كل 1 دقيقة
  console.log('bot is searching for keywords every 5 minutes');
}

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

startPolling().catch(console.error); 