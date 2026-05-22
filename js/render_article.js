document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('article-content');
  if (!container) return;

  const articleId = getArticleId();
  if (!articleId) {
    renderArticleError('Помилка 404', 'Статтю не знайдено або її поглинула темрява.');
    return;
  }

  const commentsList = document.getElementById('comments-list');
  const commentFormContainer = document.getElementById('comment-form-container');

  try {
    const catalogArticle = await findArticleInCatalogs(articleId);

    if (catalogArticle && hasLocalContent(catalogArticle)) {
      await renderLocalArticle(catalogArticle);
      loadComments();
      checkAuthAndShowForm();
      return;
    }

    const telegraphId = getTelegraphId(catalogArticle?.url || articleId);
    if (!telegraphId) {
      throw new Error('Article source is not available');
    }

    const response = await fetch(`https://api.telegra.ph/getPage/${telegraphId}?return_content=true`, {
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Telegraph API error');
    }

    renderArticle(data.result, catalogArticle);
    loadComments();
    checkAuthAndShowForm();
  } catch (error) {
    console.error('Помилка завантаження статті:', error);
    renderArticleError(
      'Щось пішло не так...',
      'Не вдалося завантажити статтю. Перевірте посилання або локальний запис у каталозі.'
    );
  }

  function getArticleId() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('id') || '').trim().replace(/^\/+/, '');
  }

  async function findArticleInCatalogs(id) {
    const sources = [
      'articles_data.json',
      'data/general/articles_data.json',
      'data/horror_games/articles_data.json',
      'data/horror_movies/articles_data.json',
      'data/reviews/articles_data.json',
      'data/internet_horror/articles_data.json',
      'data/horror_art/articles_data.json',
      'data/horror_literature/articles_data.json'
    ];

    const catalogs = await Promise.all(sources.map(async (source) => {
      try {
        const response = await fetch(`${source}?t=${Date.now()}`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        return [];
      }
    }));

    const articles = catalogs.flat();
    return articles.find((article) => {
      if (!article || typeof article !== 'object') return false;
      return article.localId === id
        || article.local_id === id
        || getCatalogArticleId(article.url) === id
        || String(article.url || '') === id;
    }) || null;
  }

  function getCatalogArticleId(url) {
    if (!url) return '';
    try {
      const parsedUrl = new URL(url, window.location.href);
      if (parsedUrl.protocol === 'local:') {
        return parsedUrl.pathname.replace(/^\/+/, '').replace('/', ':');
      }
      return parsedUrl.pathname.replace(/^\/+/, '') || String(url);
    } catch (error) {
      return String(url || '').replace(/^https?:\/\/telegra\.ph\//i, '').replace(/^\/+/, '');
    }
  }

  function getTelegraphId(source) {
    const raw = String(source || '').trim();
    if (!raw || raw.startsWith('local://')) return '';

    try {
      const url = new URL(raw, 'https://telegra.ph');
      if (!/telegra\.ph$/i.test(url.hostname)) return '';
      return url.pathname.replace(/^\/+/, '');
    } catch (error) {
      return raw.replace(/^https?:\/\/telegra\.ph\//i, '').replace(/^\/+/, '');
    }
  }

  function hasLocalContent(article) {
    return Boolean(article?.contentHtml || article?.content_html || article?.contentPath || article?.content_path);
  }

  async function renderLocalArticle(article) {
    const title = document.createElement('h1');
    title.textContent = article.title || 'Без назви';

    const meta = document.createElement('div');
    meta.className = 'article-meta';

    const info = document.createElement('span');
    info.textContent = [
      article.sectionLabel,
      article.genre,
      article.release_date,
      article.developer
    ].map((value) => (value || '').trim()).filter(Boolean).join(' | ') || 'Horror Hub';

    meta.appendChild(info);

    if (article.url && !String(article.url).startsWith('local://')) {
      const sourceLink = document.createElement('a');
      sourceLink.href = article.url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.className = 'tg-button';
      sourceLink.textContent = /telegra\.ph/i.test(article.url) ? 'Відкрити в Telegraph' : 'Відкрити джерело';
      meta.appendChild(sourceLink);
    }

    const body = document.createElement('div');
    body.className = 'article-body';

    const inlineHtml = article.contentHtml || article.content_html || '';
    const contentPath = article.contentPath || article.content_path || '';

    if (inlineHtml) {
      body.appendChild(renderSafeHtml(inlineHtml));
    } else if (contentPath) {
      const response = await fetch(contentPath, { headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`Local content HTTP ${response.status}`);
      body.appendChild(renderSafeHtml(await response.text()));
    }

    if ((article.localId || article.local_id) === 'internet_horror:scp') {
      body.appendChild(createScpInteractiveDossier());
    }

    container.replaceChildren(title, meta, body);
    document.title = `${title.textContent} - Horror Hub`;
  }

  function createScpInteractiveDossier() {
    const state = {
      scene: 0,
      insight: 0,
      ethics: 0,
      control: 0,
      risk: 0,
      casualties: 0,
      flags: new Set(),
      usedActions: new Set(),
      log: [],
      event: 'Камери ділянки активні. Очікується перший протокол.',
      eventTone: 'idle',
      subjects: [
        { id: 'D-9341', status: 'Очікує інструктаж', condition: 'stable' },
        { id: 'D-1288', status: 'Під наглядом', condition: 'stable' },
        { id: 'D-7710', status: 'Резервна група', condition: 'stable' }
      ]
    };

    const scenes = [
      {
        code: 'briefing',
        title: 'Вступний брифінг: два походження SCP',
        object: 'Архів Фонду / Реальна історія спільноти',
        className: 'Safe / Meta',
        lore: 'У лорі Фонд — таємна організація, що знаходить, ізолює й вивчає аномалії, приховуючи їх від людства. Документи виглядають як службові звіти: номер об’єкта, клас, процедури утримання й опис.',
        history: 'У реальності SCP почався з SCP-173: моторошного документа, опублікованого на дошці /x/ 4chan 22 червня 2007 року. 19 січня 2008 року з’явилася перша SCP-вікі на EditThis, а в липні 2008 спільнота переїхала на Wikidot.',
        test: 'Директорка ділянки дає вам першу папку. Вам треба вирішити, як навчити D-клас перед тестами: через сухий протокол чи через пояснення історії Фонду.',
        choices: [
          {
            label: 'Провести повний історичний брифінг',
            note: 'D-клас розуміє правила краще, але починає ставити незручні питання.',
            effects: { insight: 2, ethics: 1, control: 0, risk: 0 },
            log: 'Ви пояснили різницю між реальним SCP Wiki та внутрішнім лором Фонду. У звіті з’являється перша помітка: "Формат документа сам створює страх".'
          },
          {
            label: 'Дати тільки накази й не пояснювати контекст',
            note: 'Швидше й дисциплінованіше, але персонал діє механічно.',
            effects: { insight: 0, ethics: -1, control: 2, risk: 1 },
            log: 'Ви обмежилися інструкціями. Протокол виконано, але D-клас не розуміє, чому деякі правила не можна порушувати навіть на секунду.'
          },
          {
            label: 'Попросити D-клас описати власні страхи перед тестами',
            note: 'Незвична методика відкриває психологічний шар SCP.',
            effects: { insight: 1, ethics: 2, control: -1, risk: 0 },
            log: 'Ви фіксуєте, що страх перед SCP часто народжується до контакту з об’єктом: із самої форми інструкцій, чуток і очікування.'
          }
        ]
      },
      {
        code: 'scp-173',
        title: 'Тест 173: скульптура, з якої все почалося',
        object: 'SCP-173',
        className: 'Euclid',
        lore: 'SCP-173 — ворожа бетонно-арматурна скульптура. Вона не рухається, поки перебуває в прямому полі зору. Персонал має підтримувати контакт очима й попереджати одне одного перед морганням.',
        history: 'SCP-173 став першим текстом у стилі SCP. Він задав клінічний тон, номерний формат, процедури утримання й головну ідею: страшне можна описати як холодний службовий документ.',
        test: 'Троє D-класу заходять для очищення камери. Один має прибирати, двоє — дивитися на об’єкт і координувати моргання. Через динамік ви чуєте: "Докторе, у нас проблема з лівим спостерігачем".',
        choices: [
          {
            label: 'Наказати зупинити прибирання й вивести групу',
            note: 'Контрольований відступ збереже людей, але тест буде неповним.',
            effects: { insight: 1, ethics: 2, control: 1, risk: -1 },
            flag: 'spared173',
            log: 'Ви зупинили тест. У звіті: "SCP-173 навчає головному принципу Фонду: процедура важливіша за цікавість".'
          },
          {
            label: 'Продовжити тест: змусити другого D-класу дублювати погляд',
            note: 'Дані будуть повнішими, ризик різко зросте.',
            effects: { insight: 2, ethics: -1, control: 1, risk: 2, casualties: 1 },
            flag: 'hardline173',
            log: 'Ви отримали точні дані про реакцію об’єкта на втрату координації. Один рядок у журналі закритий чорним маркером.'
          },
          {
            label: 'Використати камери й світловий сигнал для синхронізації',
            note: 'Метод обережний, але техніка не замінює людського погляду повністю.',
            effects: { insight: 2, ethics: 1, control: 2, risk: 0 },
            log: 'Комбінація камер і голосових команд спрацювала. Ви розумієте: SCP — це хоррор правил, де маленьке порушення змінює все.'
          }
        ]
      },
      {
        code: 'scp-049',
        title: 'Тест 049: лікар, чума й мова переконання',
        object: 'SCP-049',
        className: 'Euclid',
        lore: 'SCP-049 має вигляд чумного лікаря й говорить про "пошесть", яку нібито бачить у людях. Його дотик смертельний, а після втручань він може створювати SCP-049-2 — reanimated subjects.',
        history: 'Об’єкти на кшталт SCP-049 показали, що SCP може бути не лише монстром, а персонажем із голосом, манією, псевдонауковою логікою й власною системою переконань.',
        test: 'D-9341 має зайти в камеру для розмови через захисний бар’єр. SCP-049 поводиться ввічливо й просить "оглянути пацієнта". Його тон майже заспокійливий.',
        choices: [
          {
            label: 'Дозволити тільки розмову через бар’єр',
            note: 'Безпечніше, але SCP-049 дасть менше поведінкових даних.',
            effects: { insight: 1, ethics: 1, control: 2, risk: -1 },
            log: 'SCP-049 говорить про "лікування" як про моральний обов’язок. Ви записуєте: аномалія небезпечна не лише дотиком, а й переконливістю.'
          },
          {
            label: 'Дати D-класу роль "асистента" під дистанційним контролем',
            note: 'Ви перевірите лор об’єкта, але підштовхнете його до активності.',
            effects: { insight: 2, ethics: -1, control: 0, risk: 2, casualties: 1 },
            flag: '049assistant',
            log: 'SCP-049 охоче прийняв "асистента". Протокол перервано після першої спроби порушити дистанцію. Дані цінні, атмосфера в наглядовій кімнаті — ні.'
          },
          {
            label: 'Поставити питання про те, що таке "пошесть"',
            note: 'Ризик нижчий, а розуміння міфології SCP глибше.',
            effects: { insight: 3, ethics: 1, control: 1, risk: 0 },
            log: 'Відповідь SCP-049 суперечлива, але важлива: багато SCP лякають не тілом, а власною логікою, яка не збігається з людською.'
          }
        ]
      },
      {
        code: 'scp-096',
        title: 'Тест 096: обличчя, якого не можна бачити',
        object: 'SCP-096',
        className: 'Euclid',
        lore: 'SCP-096 стає неконтрольовано агресивним, коли хтось бачить його обличчя — навіть на фото або відео. Його жах побудований на забороненому погляді.',
        history: 'SCP-096 закріпив любов спільноти до простих, але сильних правил. Один образ, одна заборона, один катастрофічний наслідок — і з цього народжується легенда.',
        test: 'Вам пропонують старий кадр із частково закритим обличчям SCP-096. D-клас має підтвердити, чи цензура достатня. Це звучить як тест зображення, але в кімнаті всі говорять тихіше, ніж треба.',
        choices: [
          {
            label: 'Відмовитися від перегляду й вимагати цифрову перевірку цензури',
            note: 'Повільно, зате протокол не спокушає долю.',
            effects: { insight: 1, ethics: 2, control: 2, risk: -1 },
            log: 'Ви відмовилися від живого перегляду. У висновку: "SCP-096 — доказ того, що в SCP небезпечним може бути сам акт сприйняття".'
          },
          {
            label: 'Дати кадр одному D-класу в ізольованій кімнаті',
            note: 'Класична жорстка методика Фонду. Дані будуть прямі.',
            effects: { insight: 2, ethics: -2, control: -1, risk: 3, casualties: 1 },
            flag: '096viewed',
            log: 'Система тривоги спрацювала раніше, ніж ви встигли завершити диктування. Дані підтверджено. Ціну приховано в додатку 096-І.'
          },
          {
            label: 'Замість фото використати опис без візуального контакту',
            note: 'Менше ризику, більше уваги до природи правила.',
            effects: { insight: 2, ethics: 1, control: 1, risk: 0 },
            log: 'Опис не активував SCP-096. Ви розумієте різницю між знанням про об’єкт і прямим контактом із небезпечною інформацією.'
          }
        ]
      },
      {
        code: 'scp-106',
        title: 'Тест 106: корозія, приманка й кишеньковий вимір',
        object: 'SCP-106',
        className: 'Keter',
        lore: 'SCP-106 проходить крізь тверді поверхні, спричиняє корозію й затягує жертв у власний кишеньковий вимір. У лорі він уособлює повільне переслідування й садистську гру.',
        history: 'Keter-об’єкти показують іншу сторону SCP: не все можна "зрозуміти" достатньо добре, щоб стало безпечно. Іноді процедура — це лише спосіб відкласти катастрофу.',
        test: 'Фонд пропонує використати D-клас як приманку для перевірки аварійної системи утримання. У журналі цей протокол позначено як допустимий, але попередні сторінки заляпані чорнилами.',
        choices: [
          {
            label: 'Відмовитися від живої приманки й використати симуляцію',
            note: 'Етичніше, але деякі дані будуть визнані неповними.',
            effects: { insight: 1, ethics: 3, control: 0, risk: -1 },
            flag: 'ethics106',
            log: 'Ви обираєте симуляцію. Комітет з етики ставить маленьку позначку біля вашого прізвища. Не схоже на похвалу. Не схоже й на догану.'
          },
          {
            label: 'Погодитися на протокол приманки',
            note: 'Система буде перевірена в реальних умовах.',
            effects: { insight: 2, ethics: -2, control: 1, risk: 3, casualties: 1 },
            flag: '106bait',
            log: 'SCP-106 реагує. Система утримання спрацьовує із затримкою. Ви отримуєте дані, але вночі згадуєте звук, який не мав пройти крізь скло.'
          },
          {
            label: 'Зупинити тест і подати службову скаргу',
            note: 'Ризик для кар’єри, але ви змінюєте рамку експерименту.',
            effects: { insight: 2, ethics: 2, control: -1, risk: 0 },
            flag: 'complaint106',
            log: 'Вашу скаргу прийнято. Через годину її класифіковано. Ви вперше розумієте: Фонд містить не лише аномалії, а й власні компроміси.'
          }
        ]
      },
      {
        code: 'scp-682',
        title: 'Тест 682: бажання знищити незнищенне',
        object: 'SCP-682',
        className: 'Keter',
        lore: 'SCP-682 — надзвичайно адаптивна істота, яку Фонд неодноразово намагався знищити. Вона символізує межу між утриманням і одержимістю контролем.',
        history: 'SCP-682 став одним із найвідоміших ранніх об’єктів, бо вивів формат за межі "одне правило — один монстр". Навколо нього виросла культура тестів, крос-посилань і спроб зіткнення з іншими SCP.',
        test: 'Ваш останній протокол: запропонувати не знищення, а нову модель документації SCP-682. Командування хоче агресивний тест. Архівісти хочуть чесний звіт. Ви маєте обрати фінальний підхід.',
        choices: [
          {
            label: 'Написати звіт: "знищення не є науковою метою"',
            note: 'Ви ставите межу між дослідженням і помстою.',
            effects: { insight: 3, ethics: 2, control: 0, risk: -1 },
            flag: 'report682',
            log: 'Ваш звіт звучить майже єретично для частини персоналу: Фонд має утримувати, а не доводити власну всемогутність.'
          },
          {
            label: 'Погодитися на агресивний тест адаптації',
            note: 'Дані будуть видовищні. І, можливо, катастрофічні.',
            effects: { insight: 2, ethics: -2, control: -1, risk: 4, casualties: 1 },
            flag: 'attack682',
            log: 'SCP-682 адаптується швидше, ніж прогнозувала модель. Уперше за день ви чуєте в голосі директора не холод, а страх.'
          },
          {
            label: 'Передати справу Архіву й порівняти SCP-682 з історією сайту',
            note: 'Ви бачите об’єкт як міф, що росте через спільноту.',
            effects: { insight: 4, ethics: 1, control: 1, risk: 0 },
            flag: 'archive682',
            log: 'Ви зіставляєте SCP-682 із реальним розвитком SCP Wiki: що більше авторів додають матеріал, то живучішим стає міф.'
          }
        ]
      }
    ];

    const sceneActions = {
      briefing: [
        {
          id: 'archive',
          label: 'Підняти архів 2007/2008',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'В архівній стрічці видно шлях від одного поста SCP-173 до вікі-формату. Персонал краще розуміє, чому документ виглядає як протокол.'
        },
        {
          id: 'briefing-room',
          label: 'Перевірити кімнату інструктажу',
          stat: 'Контроль +1',
          effects: { control: 1 },
          result: 'Камера інструктажу ізольована, аудіозапис увімкнено, внутрішні двері заблоковані.'
        },
        {
          id: 'ethics-note',
          label: 'Позначити D-клас як персонал',
          stat: 'Етика +1',
          effects: { ethics: 1 },
          result: 'У формі тесту з’являється рядок про психологічний стан D-класу. Це дрібниця, але вона змінює тон усього звіту.'
        }
      ],
      'scp-173': [
        {
          id: 'blink-sync',
          label: 'Синхронізувати моргання',
          stat: 'Контроль +1',
          effects: { control: 1 },
          result: 'Світловий сигнал задає ритм. На моніторі погляд групи тримається стабільніше.'
        },
        {
          id: 'camera-scan',
          label: 'Сканувати камеру 173',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'Скан не показує руху, але фіксує зміну позиції між кадрами. SCP-173 вкотре доводить: небезпека живе у проміжку.'
        },
        {
          id: 'exit-route',
          label: 'Відкрити аварійний маршрут',
          stat: 'Ризик -1',
          effects: { risk: -1, control: 1 },
          result: 'Другий шлюз підготовлено. Якщо протокол зірветься, група має шанс вийти без паніки.'
        }
      ],
      'scp-049': [
        {
          id: 'voice-analysis',
          label: 'Проаналізувати голос 049',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'Мовний аналіз показує спокійні паузи й навмисно ввічливу інтонацію. SCP-049 працює не тільки страхом, а й довірою.'
        },
        {
          id: 'barrier-check',
          label: 'Перевірити бар’єр',
          stat: 'Контроль +1',
          effects: { control: 1 },
          result: 'Контактний бар’єр витримує тест. Асистент у навушнику отримує наказ не наближатися навіть на прохання об’єкта.'
        },
        {
          id: 'medical-consent',
          label: 'Зупинити медичну рольову гру',
          stat: 'Етика +1',
          effects: { ethics: 1 },
          result: 'Ви прибираєте з протоколу слово "пацієнт". Це зменшує вплив мови SCP-049 на D-клас.'
        }
      ],
      'scp-096': [
        {
          id: 'pixel-audit',
          label: 'Запустити піксельний аудит',
          stat: 'Контроль +1',
          effects: { control: 1 },
          result: 'Алгоритм перевіряє кадр без людського перегляду. У кімнаті стає трохи легше дихати.'
        },
        {
          id: 'blindfold-protocol',
          label: 'Підготувати сліпий протокол',
          stat: 'Ризик -1',
          effects: { risk: -1, ethics: 1 },
          result: 'D-клас отримує інструкції без прямого контакту із зображенням. Ніхто не жартує про те, що саме приховано цензурою.'
        },
        {
          id: 'infohazard-note',
          label: 'Позначити інфозагрозу',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'У звіті з’являється окрема позначка: небезпекою може бути не тіло об’єкта, а спосіб сприйняття інформації.'
        }
      ],
      'scp-106': [
        {
          id: 'corrosion-map',
          label: 'Карта корозії',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'Плями на стіні складаються у маршрут. SCP-106 поводиться як мисливець, що любить залишати сліди.'
        },
        {
          id: 'lure-sim',
          label: 'Симуляція приманки',
          stat: 'Етика +1',
          effects: { ethics: 1, risk: -1 },
          result: 'Модель не ідеальна, але вона дає достатньо даних без живої приманки. Не всім у командуванні це подобається.'
        },
        {
          id: 'door-lock',
          label: 'Заблокувати третій шлюз',
          stat: 'Контроль +1',
          effects: { control: 1 },
          result: 'Третій шлюз переходить у ручний режим. Якщо корозія піде по підлозі, ви виграєте кілька секунд.'
        }
      ],
      'scp-682': [
        {
          id: 'adaptation-model',
          label: 'Побудувати модель адаптації',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'Модель показує неприємну річ: що агресивніший тест, то швидше SCP-682 перетворює його на урок для себе.'
        },
        {
          id: 'abort-channel',
          label: 'Підготувати канал скасування',
          stat: 'Ризик -1',
          effects: { risk: -1, control: 1 },
          result: 'Аварійний канал відкрито. Директор невдоволений, але ви тепер маєте кнопку, яка не залежить від його настрою.'
        },
        {
          id: 'archive-compare',
          label: 'Порівняти з архівами Wiki',
          stat: 'Розуміння +1',
          effects: { insight: 1 },
          result: 'SCP-682 схожий на міф, який навчився виживати через чужі спроби його зламати. Так працює і багато інтернет-легенд.'
        }
      ]
    };

    const root = document.createElement('section');
    root.className = 'scp-sim';

    const header = document.createElement('div');
    header.className = 'scp-sim__header';
    header.innerHTML = `
      <span class="scp-sim__stamp">SCP FOUNDATION TRAINING SIMULATION</span>
      <h3>Протокол молодшого дослідника</h3>
      <p>Ваші рішення змінюють фінальний звіт. Обережність, етика й цікавість не завжди ведуть в один бік.</p>
    `;

    const meters = document.createElement('div');
    meters.className = 'scp-sim__meters';

    const sceneBox = document.createElement('div');
    sceneBox.className = 'scp-sim__scene';

    const toolsBox = document.createElement('div');
    toolsBox.className = 'scp-sim__tools';

    const choicesBox = document.createElement('div');
    choicesBox.className = 'scp-sim__choices';

    const logBox = document.createElement('div');
    logBox.className = 'scp-sim__log';

    root.append(header, meters, sceneBox, toolsBox, choicesBox, logBox);

    function render() {
      if (state.scene >= scenes.length) {
        renderEnding();
        return;
      }

      const scene = scenes[state.scene];
      renderMeters();
      sceneBox.innerHTML = `
        <div class="scp-sim__fileline">
          <span>Об'єкт: ${scene.object}</span>
          <span>Клас: ${scene.className}</span>
          <span>Крок ${state.scene + 1}/${scenes.length}</span>
        </div>
        <h4>${scene.title}</h4>
        <div class="scp-sim__layout">
          <div class="scp-sim__viewport scp-sim__viewport--${scene.code}">
            ${getSceneSvg(scene.code)}
            <div class="scp-sim__readout">
              <b>${scene.object}</b>
              <span>${getSceneReadout(scene)}</span>
            </div>
            <p class="scp-sim__event scp-sim__event--${state.eventTone}">${state.event}</p>
          </div>
          <div>
            <article class="scp-sim__panel">
              <h5>Лор Фонду</h5>
              <p>${scene.lore}</p>
            </article>
            <article class="scp-sim__panel scp-sim__panel--history">
              <h5>Реальна історія SCP</h5>
              <p>${scene.history}</p>
            </article>
            <p class="scp-sim__test">${scene.test}</p>
          </div>
        </div>
      `;

      renderTools(scene);
      choicesBox.replaceChildren(...scene.choices.map((choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'scp-sim__choice';
        button.innerHTML = `<strong>${choice.label}</strong><span>${choice.note}</span>`;
        button.addEventListener('click', () => choose(choice));
        return button;
      }));

      renderLog();
    }

    function renderTools(scene) {
      const actions = sceneActions[scene.code] || [];
      const roster = state.subjects.map((subject) => `
        <span class="scp-sim__subject scp-sim__subject--${subject.condition}">
          <b>${subject.id}</b>
          <em>${subject.status}</em>
        </span>
      `).join('');

      toolsBox.innerHTML = `
        <div class="scp-sim__tool-head">
          <div>
            <h5>Панель дослідника</h5>
            <p>Ці службові дії не завершують тест, але можуть змінити статистику й відкрити додатковий контекст.</p>
          </div>
          <div class="scp-sim__roster" aria-label="Стан персоналу класу D">${roster}</div>
        </div>
        <div class="scp-sim__tool-buttons"></div>
      `;

      const buttons = toolsBox.querySelector('.scp-sim__tool-buttons');
      actions.forEach((action) => {
        const key = `${scene.code}:${action.id}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'scp-sim__tool';
        button.disabled = state.usedActions.has(key);
        button.innerHTML = `<strong>${action.label}</strong><span>${button.disabled ? 'Виконано' : action.stat}</span>`;
        button.addEventListener('click', () => useTool(scene, action));
        buttons.appendChild(button);
      });
    }

    function useTool(scene, action) {
      const key = `${scene.code}:${action.id}`;
      if (state.usedActions.has(key)) return;

      state.usedActions.add(key);
      applyEffects(action.effects || {});
      state.event = action.result;
      state.eventTone = getEventTone(action.effects || {});
      state.log.unshift(`[${action.label}] ${action.result}`);
      render();
    }

    function choose(choice) {
      const scene = scenes[state.scene];
      const effects = choice.effects || {};
      applyEffects(effects);
      updateSubjects(scene, choice);
      state.event = getIncidentEvent(scene, choice);
      state.eventTone = getEventTone(effects);

      if (choice.flag) state.flags.add(choice.flag);
      state.log.unshift(choice.log);
      state.scene += 1;
      render();
    }

    function applyEffects(effects) {
      state.insight += effects.insight || 0;
      state.ethics += effects.ethics || 0;
      state.control += effects.control || 0;
      state.risk = Math.max(0, state.risk + (effects.risk || 0));
      state.casualties = Math.max(0, state.casualties + (effects.casualties || 0));
    }

    function updateSubjects(scene, choice) {
      const effects = choice.effects || {};
      const nextSubjects = state.subjects.map((subject) => ({ ...subject }));
      const available = nextSubjects.find((subject) => subject.condition !== 'lost');

      if (effects.casualties > 0 && available) {
        available.status = `Втрачено під час ${scene.object}`;
        available.condition = 'lost';
      } else if (effects.risk > 1 && available) {
        available.status = `Після ${scene.object}: гострий стрес`;
        available.condition = 'warning';
      } else if (effects.ethics > 1 && available) {
        available.status = `Після ${scene.object}: стабільний`;
        available.condition = 'stable';
      } else if (effects.control > 1 && available) {
        available.status = `Після ${scene.object}: під контролем`;
        available.condition = 'stable';
      }

      state.subjects = nextSubjects;
    }

    function getEventTone(effects) {
      if ((effects.casualties || 0) > 0 || (effects.risk || 0) >= 3) return 'danger';
      if ((effects.risk || 0) > 0 || (effects.control || 0) < 0) return 'warning';
      if ((effects.ethics || 0) > 0 || (effects.control || 0) > 0) return 'stable';
      return 'idle';
    }

    function getIncidentEvent(scene, choice) {
      const effects = choice.effects || {};
      if ((effects.casualties || 0) > 0) {
        return `Інцидент у секторі ${scene.object}: журнал втрат оновлено, частина запису засекречена.`;
      }
      if ((effects.risk || 0) >= 3) {
        return `Тривога: ${scene.object} реагує сильніше за прогноз. Протокол переходить у режим червоного спостереження.`;
      }
      if ((effects.control || 0) >= 2) {
        return `Стабілізація: ${scene.object} лишається в межах процедури, наглядова кімната повертається до штатного режиму.`;
      }
      if ((effects.ethics || 0) >= 2) {
        return `Комітет з етики отримав автоматичну копію фрагмента тесту. Це може бути добре. Або просто цікаво.`;
      }
      return `Протокол ${scene.object} оновлено. Наступна папка вже лежить у внутрішньому лотку.`;
    }

    function getSceneReadout(scene) {
      const readouts = {
        briefing: 'Архівний режим: зіставлення лору Фонду й реальної історії Wiki.',
        'scp-173': 'Відеопотік: візуальний контакт обов’язковий, моргання координувати голосом.',
        'scp-049': 'Аудіоканал: суб’єкт ввічливий, риторика медична, прямий контакт заборонено.',
        'scp-096': 'Інфозагроза: обличчя не показувати, кадри перевіряти тільки непрямими методами.',
        'scp-106': 'Корозійний слід: поверхні нестабільні, персонал тримати біля шлюзу.',
        'scp-682': 'Адаптивна загроза: агресивні стимули можуть підвищити здатність до виживання.'
      };
      return readouts[scene.code] || scene.className;
    }

    function getSceneSvg(code) {
      const svgs = {
        briefing: `
          <svg viewBox="0 0 220 160" role="img" aria-label="Схема архіву SCP">
            <rect x="10" y="18" width="200" height="124" rx="4"></rect>
            <circle cx="110" cy="80" r="34"></circle>
            <path d="M110 42v25M110 93v25M72 80h25M123 80h25"></path>
            <path d="M92 58l18 22 18-22M92 102l18-22 18 22"></path>
            <text x="110" y="151">SECURE CONTAIN PROTECT</text>
          </svg>
        `,
        'scp-173': `
          <svg viewBox="0 0 220 160" role="img" aria-label="Силует SCP-173">
            <rect x="18" y="20" width="184" height="118" rx="4"></rect>
            <path d="M90 122h42M96 122l6-44h20l6 44M92 78l-14-22 18-18h30l18 18-14 22"></path>
            <circle cx="102" cy="57" r="4"></circle>
            <circle cx="120" cy="57" r="4"></circle>
            <path d="M48 45c24 17 100 17 124 0M48 113c24-17 100-17 124 0"></path>
          </svg>
        `,
        'scp-049': `
          <svg viewBox="0 0 220 160" role="img" aria-label="Маска чумного лікаря SCP-049">
            <rect x="18" y="20" width="184" height="118" rx="4"></rect>
            <path d="M84 55c14-22 53-22 67 0 9 15 3 42-19 50l-30 11c-18 7-31-2-29-18 1-13 7-28 11-43z"></path>
            <path d="M125 82c22 3 42 12 55 28M91 73h23M82 96c14 9 31 10 48 2"></path>
            <circle cx="103" cy="64" r="5"></circle>
            <path d="M64 34c25-10 66-10 92 1"></path>
          </svg>
        `,
        'scp-096': `
          <svg viewBox="0 0 220 160" role="img" aria-label="Засекречений кадр SCP-096">
            <rect x="18" y="20" width="184" height="118" rx="4"></rect>
            <path d="M88 124c-10-23-10-62 0-82 8-17 37-17 45 0 10 20 10 59 0 82"></path>
            <rect x="62" y="54" width="96" height="13"></rect>
            <rect x="76" y="86" width="70" height="12"></rect>
            <path d="M42 40h36M144 40h34M42 121h36M144 121h34"></path>
            <text x="110" y="149">FACE DATA REDACTED</text>
          </svg>
        `,
        'scp-106': `
          <svg viewBox="0 0 220 160" role="img" aria-label="Корозійний портал SCP-106">
            <rect x="18" y="20" width="184" height="118" rx="4"></rect>
            <ellipse cx="111" cy="78" rx="43" ry="52"></ellipse>
            <path d="M88 36c-22 15-26 64 0 93M132 36c22 15 26 64 0 93"></path>
            <path d="M67 48c19 7 33 18 43 34M153 46c-23 9-37 23-43 36M80 124c17-12 45-12 62 0"></path>
            <path d="M44 124h30M146 124h30M54 133h52M116 133h50"></path>
          </svg>
        `,
        'scp-682': `
          <svg viewBox="0 0 220 160" role="img" aria-label="Силует SCP-682">
            <rect x="18" y="20" width="184" height="118" rx="4"></rect>
            <path d="M39 103c30-35 81-51 139-34l18 13-20 9c-49-8-87 4-117 29z"></path>
            <circle cx="159" cy="75" r="4"></circle>
            <path d="M151 91l9 10 9-10 9 10M70 112l-11 20M94 106l-8 24M122 98l-4 25M49 100l-21-9"></path>
            <text x="110" y="149">TERMINATION ATTEMPTS DENIED</text>
          </svg>
        `
      };

      return svgs[code] || svgs.briefing;
    }

    function renderMeters() {
      const items = [
        { label: 'Розуміння SCP', value: state.insight, max: 14 },
        { label: 'Етика', value: state.ethics, max: 10 },
        { label: 'Контроль', value: state.control, max: 10 },
        { label: 'Ризик', value: state.risk, max: 12 },
        { label: 'Втрати', value: state.casualties, max: 4 }
      ];

      meters.replaceChildren(...items.map((item) => {
        const meter = document.createElement('div');
        meter.className = 'scp-sim__meter';
        const percent = Math.max(0, Math.min(100, (item.value / item.max) * 100));
        meter.innerHTML = `
          <div><span>${item.label}</span><b>${item.value}</b></div>
          <i><em style="width:${percent}%"></em></i>
        `;
        return meter;
      }));
    }

    function renderLog() {
      const entries = state.log.slice(0, 4);
      logBox.innerHTML = `
        <h5>Журнал спостережень</h5>
        ${entries.length ? entries.map((entry) => `<p>${entry}</p>`).join('') : '<p>Записи з’являться після першого рішення.</p>'}
      `;
    }

    function renderEnding() {
      renderMeters();

      const ending = getEnding();
      toolsBox.innerHTML = '';
      sceneBox.innerHTML = `
        <div class="scp-sim__fileline">
          <span>Фінальний звіт</span>
          <span>${ending.code}</span>
        </div>
        <h4>${ending.title}</h4>
        <article class="scp-sim__panel">
          <h5>Підсумок симуляції</h5>
          <p>${ending.body}</p>
        </article>
        <article class="scp-sim__panel scp-sim__panel--history">
          <h5>Що ви зрозуміли про SCP</h5>
          <p>${ending.lesson}</p>
        </article>
      `;

      const restart = document.createElement('button');
      restart.type = 'button';
      restart.className = 'scp-sim__choice scp-sim__choice--restart';
      restart.innerHTML = '<strong>Почати симуляцію заново</strong><span>Спробувати інший протокол і відкрити інший фінал.</span>';
      restart.addEventListener('click', () => {
        state.scene = 0;
        state.insight = 0;
        state.ethics = 0;
        state.control = 0;
        state.risk = 0;
        state.casualties = 0;
        state.flags.clear();
        state.usedActions.clear();
        state.log = [];
        state.event = 'Камери ділянки активні. Очікується перший протокол.';
        state.eventTone = 'idle';
        state.subjects = [
          { id: 'D-9341', status: 'Очікує інструктаж', condition: 'stable' },
          { id: 'D-1288', status: 'Під наглядом', condition: 'stable' },
          { id: 'D-7710', status: 'Резервна група', condition: 'stable' }
        ];
        render();
      });

      choicesBox.replaceChildren(restart);
      renderLog();
    }

    function getEnding() {
      if (state.risk >= 8 || state.casualties >= 3) {
        return {
          code: 'ENDING: CONTAINMENT BREACH',
          title: 'Фінал: порушення умов утримання',
          body: 'Ваші тести дали багато даних, але ціна виявилася надто високою. Частину звіту вилучено, частину персоналу переведено, а ваше ім’я зникає з відкритого списку дослідників. Фонд вижив, бо Фонд завжди виживає. Не всі співробітники — так.',
          lesson: 'Ви зрозуміли темний бік SCP: холодний документ може приховати катастрофу. Лор Фонду будується на контролі, але найстрашніші історії показують, що контроль часто є лише тимчасовою ілюзією.'
        };
      }

      if (state.insight >= 12 && state.flags.has('archive682')) {
        return {
          code: 'ENDING: ARCHIVIST CLEARANCE',
          title: 'Фінал: архівіст, який побачив формат',
          body: 'Ви завершуєте симуляцію не як польовий дослідник, а як архівіст. Ваш фінальний висновок дивний для службового документа: SCP існує завдяки формі. Номер, клас, процедура, пропуски й холодний тон створюють простір, у який читач сам впускає страх.',
          lesson: 'Ви зрозуміли і реальну історію, і лор: SCP почався з одного документа SCP-173, але став міфологією завдяки спільноті, яка навчилася писати хоррор мовою інструкцій.'
        };
      }

      if (state.ethics >= 7 && state.casualties <= 1) {
        return {
          code: 'ENDING: ETHICS COMMITTEE NOTICE',
          title: 'Фінал: протокол із людським обличчям',
          body: 'Комітет з етики залишає у вашій справі коротку помітку: "Дослідник розуміє, що персонал класу D не є витратним матеріалом у літературному сенсі". Це не підвищення, але й не покарання. Вам дозволяють продовжити роботу з аномаліями інформаційного типу.',
          lesson: 'SCP страшний не тільки об’єктами, а й системою, яка вирішує, що допустимо заради утримання. Ваш фінал показує: навіть у лорі Фонду питання етики може бути сильнішим за будь-якого монстра.'
        };
      }

      if (state.control >= 7 && state.ethics < 4) {
        return {
          code: 'ENDING: SITE PROMOTION',
          title: 'Фінал: кар’єра в машині Фонду',
          body: 'Ваші протоколи ефективні, звіти точні, втрати прийнятні за внутрішніми нормами. Вас рекомендують до роботи з об’єктами підвищеної небезпеки. У коридорі хтось вітає вас із підвищенням, але ви не пам’ятаєте, коли востаннє питали D-клас на ім’я.',
          lesson: 'Ви зрозуміли SCP як систему контролю. Це теж важлива частина лору: Фонд часто виглядає героїчним, але його методи змушують питати, де межа між захистом людства й дегуманізацією.'
        };
      }

      return {
        code: 'ENDING: JUNIOR RESEARCHER FILE CLOSED',
        title: 'Фінал: молодший дослідник вижив',
        body: 'Ваш звіт не ідеальний, але корисний. Ви не стали легендою Фонду, не знищили ділянку й не відкрили всі архіви. Зате зрозуміли достатньо, щоб наступного разу читати будь-який SCP-документ уважніше.',
        lesson: 'SCP — це одночасно лор про секретну організацію й реальний колективний письменницький проєкт. Його історія почалася в інтернет-фольклорі, а сила тримається на простій ідеї: невідоме страшніше, коли його описують як інструкцію.'
      };
    }

    render();
    return root;
  }

  function renderSafeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    const fragment = document.createDocumentFragment();
    template.content.childNodes.forEach((node) => {
      fragment.appendChild(sanitizeHtmlNode(node));
    });
    return fragment;
  }

  function sanitizeHtmlNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createDocumentFragment();
    }

    const tag = node.tagName.toLowerCase();
    const allowedTags = new Set([
      'a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption',
      'figure', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
      's', 'strong', 'u', 'ul'
    ]);

    if (!allowedTags.has(tag)) {
      const childFragment = document.createDocumentFragment();
      node.childNodes.forEach((child) => childFragment.appendChild(sanitizeHtmlNode(child)));
      return childFragment;
    }

    const element = document.createElement(tag);

    if (tag === 'a' && node.getAttribute('href')) {
      setSafeLink(element, node.getAttribute('href'));
    }

    if (tag === 'img') {
      const hasSafeImage = setSafeImage(element, node.getAttribute('src'), node.getAttribute('alt') || '');
      if (!hasSafeImage) return document.createDocumentFragment();
    }

    if (!['br', 'hr', 'img'].includes(tag)) {
      node.childNodes.forEach((child) => {
        element.appendChild(sanitizeHtmlNode(child));
      });
    }

    return element;
  }

  function renderArticle(page, catalogArticle = null) {
    const title = document.createElement('h1');
    title.textContent = page.title || 'Без назви';

    const meta = document.createElement('div');
    meta.className = 'article-meta';

    const author = document.createElement('span');
    author.textContent = catalogArticle?.sectionLabel
      ? `${catalogArticle.sectionLabel} | Автор: ${page.author_name || 'Невідомий'}`
      : `Автор: ${page.author_name || 'Невідомий'}`;

    const sourceLink = document.createElement('a');
    sourceLink.href = `https://telegra.ph/${articleId}`;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.className = 'tg-button';
    sourceLink.textContent = 'Відкрити в Telegraph';

    meta.append(author, sourceLink);

    const body = document.createElement('div');
    body.className = 'article-body';

    (page.content || []).forEach((node) => {
      body.appendChild(renderTelegraphNode(node));
    });

    container.replaceChildren(title, meta, body);
    document.title = `${title.textContent} - Horror Hub`;
  }

  function renderTelegraphNode(node) {
    if (typeof node === 'string') {
      return document.createTextNode(node);
    }

    if (!node || typeof node !== 'object') {
      return document.createTextNode('');
    }

    const tag = String(node.tag || '').toLowerCase();
    const allowedTags = new Set([
      'a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption',
      'figure', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
      's', 'strong', 'u', 'ul'
    ]);

    if (!allowedTags.has(tag)) {
      return renderChildrenAsFragment(node.children);
    }

    const element = document.createElement(tag);

    if (tag === 'a' && node.attrs?.href) {
      setSafeLink(element, node.attrs.href, 'https://telegra.ph');
    }

    if (tag === 'img') {
      const hasSafeImage = setSafeImage(element, node.attrs?.src, node.attrs?.alt, 'https://telegra.ph');
      if (!hasSafeImage) return document.createDocumentFragment();
    }

    if (!['br', 'hr', 'img'].includes(tag)) {
      (node.children || []).forEach((child) => {
        element.appendChild(renderTelegraphNode(child));
      });
    }

    return element;
  }

  function renderChildrenAsFragment(children = []) {
    const fragment = document.createDocumentFragment();
    children.forEach((child) => fragment.appendChild(renderTelegraphNode(child)));
    return fragment;
  }

  function setSafeLink(link, rawHref, baseUrl = window.location.href) {
    try {
      const url = new URL(rawHref, baseUrl);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;

      link.href = url.href;
      if (url.protocol !== 'mailto:' && url.origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    } catch (error) {
      link.removeAttribute('href');
    }
  }

  function setSafeImage(image, rawSrc, alt = '', baseUrl = window.location.href) {
    if (!rawSrc) return false;

    try {
      const url = new URL(rawSrc, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return false;

      image.src = url.href;
      image.alt = alt || '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.src = 'images/placeholder.jpg';
      }, { once: true });
      return true;
    } catch (error) {
      return false;
    }
  }

  function renderArticleError(titleText, messageText) {
    const title = document.createElement('h1');
    title.textContent = titleText;

    const message = document.createElement('p');
    message.textContent = messageText;

    container.replaceChildren(title, message);
  }

  async function loadComments() {
    if (!commentsList) return;

    try {
      const response = await fetch(`api_comments.php?action=get&article_id=${encodeURIComponent(articleId)}`, {
        headers: { Accept: 'application/json' }
      });
      const comments = await response.json();

      if (!response.ok || !Array.isArray(comments)) {
        throw new Error('Невірна відповідь сервера коментарів');
      }

      if (comments.length === 0) {
        commentsList.replaceChildren(createMutedText('Поки немає коментарів. Будьте першим, хто порушить тишу...'));
        return;
      }

      const fragment = document.createDocumentFragment();
      comments.forEach((comment) => fragment.appendChild(createComment(comment)));
      commentsList.replaceChildren(fragment);
    } catch (error) {
      console.error('Помилка завантаження коментарів:', error);
      const message = createMutedText('Помилка завантаження коментарів.');
      message.classList.add('error-text');
      commentsList.replaceChildren(message);
    }
  }

  async function checkAuthAndShowForm() {
    if (!commentFormContainer) return;

    try {
      const response = await fetch('api_auth.php?action=status', {
        headers: { Accept: 'application/json' }
      });
      const auth = await response.json();

      if (auth.logged_in) {
        commentFormContainer.replaceChildren(createCommentForm());
      } else {
        commentFormContainer.replaceChildren(createLoginPrompt());
      }
    } catch (error) {
      console.error('Помилка перевірки авторизації:', error);
      commentFormContainer.replaceChildren(createLoginPrompt());
    }
  }

  function createComment(comment) {
    const item = document.createElement('article');
    item.className = 'comment-item';

    const header = document.createElement('div');
    header.className = 'comment-header';

    const avatar = document.createElement('img');
    avatar.className = 'comment-avatar';
    avatar.src = getSafeLocalOrRemoteUrl(comment.avatar, 'images/default_avatar.png');
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.addEventListener('error', () => {
      avatar.src = 'images/default_avatar.png';
    }, { once: true });

    const username = document.createElement('strong');
    username.textContent = comment.username || 'Гість';

    if (comment.role === 'admin') {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = 'Адмін';
      username.appendChild(badge);
    }

    const date = document.createElement('time');
    date.textContent = comment.created_at || '';

    header.append(avatar, username, date);

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = decodeEntities(comment.comment_text || '');

    item.append(header, body);
    return item;
  }

  function createCommentForm() {
    const form = document.createElement('form');
    form.className = 'comment-form';

    const textarea = document.createElement('textarea');
    textarea.id = 'commentText';
    textarea.rows = 3;
    textarea.placeholder = 'Напишіть свій моторошний коментар...';
    textarea.required = true;
    textarea.maxLength = 2000;

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Відправити';

    const note = document.createElement('p');
    note.className = 'form-note';

    form.append(textarea, button, note);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;

      button.disabled = true;
      button.textContent = 'Надсилання...';
      note.textContent = '';

      try {
        const formData = new FormData();
        formData.append('action', 'post');
        formData.append('article_id', articleId);
        formData.append('comment_text', text);

        const response = await fetch('api_comments.php', { method: 'POST', body: formData });
        const result = await response.json();

        if (!response.ok || result.status !== 'success') {
          throw new Error(result.message || 'Не вдалося додати коментар');
        }

        textarea.value = '';
        await loadComments();
      } catch (error) {
        note.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = 'Відправити';
      }
    });

    return form;
  }

  function createLoginPrompt() {
    const prompt = createMutedText('Щоб залишити коментар, ');
    const link = document.createElement('a');
    link.href = 'login.html';
    link.className = 'inline-link';
    link.textContent = 'увійдіть або зареєструйтесь';
    prompt.append(link, document.createTextNode('.'));
    return prompt;
  }

  function createMutedText(text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'muted-text';
    paragraph.textContent = text;
    return paragraph;
  }

  function decodeEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    return textarea.value;
  }

  function getSafeLocalOrRemoteUrl(rawUrl, fallback) {
    try {
      const url = new URL(rawUrl || fallback, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch (error) {
      return fallback;
    }
  }
});
