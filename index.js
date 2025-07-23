require('dotenv').config();

// معالجة الأخطاء غير المعالجة
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const { TwitterApi, ETwitterApiError } = require('twitter-api-v2');
const fs = require('fs');
const readline = require('readline');
const express = require('express');

console.log('🚀 Starting Twitter Bot...');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('📋 Loading environment variables...');

// طباعة جميع متغيرات البيئة للتشخيص
console.log('🔍 All environment variables:');
console.log('process.env keys:', Object.keys(process.env));
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('PORT:', process.env.PORT);

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

console.log('🔍 Specific variables:');
console.log('CLIENT_ID length:', clientId ? clientId.length : 'undefined');
console.log('CLIENT_SECRET length:', clientSecret ? clientSecret.length : 'undefined');
console.log('REDIRECT_URI:', redirectUri);

// فحص متغيرات البيئة
if (!clientId || !clientSecret || !redirectUri) {
  console.error('❌ متغيرات البيئة مفقودة!');
  console.error('CLIENT_ID:', clientId ? '✅ موجود' : '❌ مفقود');
  console.error('CLIENT_SECRET:', clientSecret ? '✅ موجود' : '❌ مفقود');
  console.error('REDIRECT_URI:', redirectUri ? '✅ موجود' : '❌ مفقود');
  console.error('تأكد من إضافة متغيرات البيئة في Railway Variables tab');
  process.exit(1);
}

console.log('✅ متغيرات البيئة موجودة بنجاح');
console.log('CLIENT_ID:', clientId);
console.log('REDIRECT_URI:', redirectUri);

const keywords = ['مطلوب معلمين']; // عدل الكلمات كما تريد
const TOKEN_PATH = './token.json';
const LAST_ID_PATH = './last_id.txt';
const TOKEN_ENV_KEY = 'TWITTER_TOKEN_DATA';

// إضافة route للـ callback
app.get('/callback', (req, res) => {
  try {
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
              }).then(response => response.json())
              .then(data => {
                if (data.success) {
                  document.body.innerHTML += '<p style="color: green;">تم حفظ التوكن بنجاح!</p>';
                } else {
                  document.body.innerHTML += '<p style="color: red;">فشل في حفظ التوكن</p>';
                }
              });
            </script>
          </body>
        </html>
      `);
    } else {
      res.status(400).send('خطأ في البيانات المستلمة');
    }
  } catch (error) {
    console.error('خطأ في callback:', error);
    res.status(500).send('خطأ في الخادم');
  }
});

app.use(express.json());

// route لاستقبال بيانات التفويض
app.post('/auth', async (req, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'الكود والحالة مطلوبان' });
    }
    
    const twitterClient = new TwitterApi({
      clientId,
      clientSecret,
    });
    
    // تحقق من وجود ملف oauth_state.json
    if (!fs.existsSync('./oauth_state.json')) {
      return res.status(500).json({ error: 'ملف oauth_state.json غير موجود' });
    }
    
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
    // حفظ التوكن في متغير بيئة (اطبع القيمة ليتم نسخها يدوياً)
    console.log('--- انسخ القيمة التالية وضعها في متغير بيئة TWITTER_TOKEN_DATA في Railway ---');
    console.log(JSON.stringify(tokenData));
    console.log('--- انتهى ---');
    res.json({ success: true, message: 'تم حفظ التوكن بنجاح. انسخ القيمة من الـ logs وضعها في متغير البيئة.' });
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
  console.log('🔐 Initializing Twitter client...');
  let token;
  // جلب التوكن من متغير البيئة إذا كان موجوداً
  if (process.env[TOKEN_ENV_KEY]) {
    try {
      token = JSON.parse(process.env[TOKEN_ENV_KEY]);
      console.log('✅ Found token in environment variable');
    } catch (error) {
      console.error('❌ Error parsing token from environment variable:', error);
      token = null;
    }
  } else if (fs.existsSync(TOKEN_PATH)) {
    // دعم قديم: جلب التوكن من الملف إذا كان موجوداً (للتوافق فقط)
    try {
      token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      console.log('✅ Found existing token file');
    } catch (error) {
      console.error('❌ Error reading token file:', error);
      token = null;
    }
  }
  const twitterClient = new TwitterApi({
    clientId,
    clientSecret,
  });
  if (!token) {
    console.log('🔑 No token found, generating OAuth URL...');
    // لا يوجد توكن، اطبع رابط التفويض فقط
    try {
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
      console.log('✅ OAuth URL generated successfully');
      console.log('🌐 OAuth URL:', url);
      
      // في بيئة Railway، لا نحتاج readline
      if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
        console.log('🚀 Running in production environment, skipping readline');
        return null; // سنتعامل مع التفويض عبر الويب
      }
      
      // استخدم Promise مع readline (للتطوير المحلي فقط)
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
            
            // تحقق من وجود ملف oauth_state.json
            if (!fs.existsSync('./oauth_state.json')) {
              console.error('ملف oauth_state.json غير موجود');
              process.exit(1);
            }
            
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
    } catch (error) {
      console.error('❌ Error generating OAuth URL:', error);
      throw error;
    }
  } else {
    console.log('🔄 Refreshing existing token...');
    try {
      const { client: userClient, accessToken, refreshToken, expiresIn, scope, tokenType } = await twitterClient.refreshOAuth2Token(token.refreshToken);
      const tokenData = {
        accessToken,
        refreshToken,
        expiresIn,
        scope,
        tokenType
      };
      // إذا كنت تعمل على Railway أو production، لا تحفظ في ملف، فقط استخدم المتغير
      if (!process.env[TOKEN_ENV_KEY]) {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
      }
      console.log('✅ Token refreshed successfully');
      return userClient;
    } catch (err) {
      console.error('❌ Failed to refresh token:', err);
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }
      if (fs.existsSync('./oauth_state.json')) {
        fs.unlinkSync('./oauth_state.json');
      }
      console.log('🔄 Will restart authentication process');
      return null;
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
  console.log('🤖 Starting polling process...');
  
  try {
    const userClient = await getUserClient();
    
    if (!userClient) {
      console.log('⚠️ No user client available, waiting for web authentication...');
      console.log('🌐 Please visit the web interface to authenticate');
      return; // لا نبدأ البولينج حتى يتم التفويض
    }
    
    console.log('✅ User client initialized successfully');
    
    let sinceId = fs.existsSync(LAST_ID_PATH) ? fs.readFileSync(LAST_ID_PATH, 'utf8') : undefined;
    
    setInterval(async () => {
      try {
        const newSinceId = await searchAndReply(userClient, sinceId);
        if (newSinceId && newSinceId !== sinceId) {
          sinceId = newSinceId;
          fs.writeFileSync(LAST_ID_PATH, sinceId);
        }
      } catch (error) {
        console.error('❌ Error in polling interval:', error);
      }
    }, 16 * 60 * 1000); // كل 16 دقيقة
    
    console.log('✅ Polling started successfully');
    console.log('⏰ Will search for keywords every 16 minutes');
  } catch (error) {
    console.error('❌ Error in startPolling:', error);
  }
}

// تشغيل السيرفر مع معالجة الأخطاء
try {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Application URL: https://web-production-1b47e.up.railway.app`);
  });
} catch (error) {
  console.error('❌ Error starting server:', error);
  process.exit(1);
}

// تشغيل البوت مع معالجة الأخطاء
try {
  startPolling().catch(error => {
    console.error('❌ Error in startPolling:', error);
  });
} catch (error) {
  console.error('❌ Error starting polling:', error);
} 