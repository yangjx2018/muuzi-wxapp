/** 对齐 MuuziGit fieldJoinLanguage.ts — 仅界面语言，不作语音识别语言 */
var fieldJoinLanguages = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
};

var fieldJoinCopy = {
  en: {
    title: 'Join the conversation',
    intro: 'Use your own phone to talk.',
    language: 'Page language',
    guest: 'Continue as a guest',
    app: 'Join with MuuZi',
    unavailable:
      'Joining by link is not available yet. Please continue on your host’s phone.',
    speech: 'You will choose your speaking language separately.',
    paste: 'Paste invitation link',
    apply: 'Open invitation',
  },
  zh: {
    title: '加入现场交流',
    intro: '用自己的手机，继续沟通。',
    language: '页面语言',
    guest: '临时加入',
    app: '使用 MuuZi 加入',
    unavailable: '扫码加入尚未开放，请先使用邀请人的手机交流。',
    speech: '说话语言会另外选择，不按手机语言自动确定。',
    paste: '粘贴邀请链接',
    apply: '打开邀请',
  },
  ja: {
    title: '会話に参加',
    intro: '自分のスマートフォンで会話しましょう。',
    language: 'ページの言語',
    guest: 'ゲストとして参加',
    app: 'MuuZi で参加',
    unavailable:
      'リンクからの参加はまだ利用できません。招待者のスマートフォンで会話を続けてください。',
    speech: '話す言語は別途選択します。',
    paste: '招待リンクを貼り付け',
    apply: '招待を開く',
  },
  ko: {
    title: '대화에 참여',
    intro: '내 휴대폰으로 대화를 이어가세요.',
    language: '페이지 언어',
    guest: '게스트로 참여',
    app: 'MuuZi로 참여',
    unavailable:
      '링크로 참여하는 기능은 아직 제공되지 않습니다. 초대한 분의 휴대폰으로 대화를 계속해 주세요.',
    speech: '말할 언어는 별도로 선택합니다.',
    paste: '초대 링크 붙여넣기',
    apply: '초대 열기',
  },
  fr: {
    title: 'Rejoindre la conversation',
    intro: 'Discutez avec votre propre téléphone.',
    language: 'Langue de la page',
    guest: 'Participer comme invité',
    app: 'Rejoindre avec MuuZi',
    unavailable:
      'La participation par lien n’est pas encore disponible. Veuillez continuer sur le téléphone de votre hôte.',
    speech: 'Vous choisirez séparément la langue parlée.',
    paste: 'Coller le lien d’invitation',
    apply: 'Ouvrir l’invitation',
  },
  de: {
    title: 'Am Gespräch teilnehmen',
    intro: 'Sprechen Sie über Ihr eigenes Telefon.',
    language: 'Sprache der Seite',
    guest: 'Als Gast teilnehmen',
    app: 'Mit MuuZi teilnehmen',
    unavailable:
      'Die Teilnahme per Link ist noch nicht verfügbar. Bitte nutzen Sie das Telefon der einladenden Person.',
    speech: 'Die gesprochene Sprache wählen Sie separat aus.',
    paste: 'Einladungslink einfügen',
    apply: 'Einladung öffnen',
  },
  es: {
    title: 'Unirse a la conversación',
    intro: 'Conversa desde tu propio teléfono.',
    language: 'Idioma de la página',
    guest: 'Continuar como invitado',
    app: 'Unirse con MuuZi',
    unavailable:
      'La participación por enlace aún no está disponible. Continúa en el teléfono de quien te invitó.',
    speech: 'El idioma que hablarás se elige por separado.',
    paste: 'Pegar enlace de invitación',
    apply: 'Abrir invitación',
  },
  pt: {
    title: 'Participar da conversa',
    intro: 'Converse pelo seu próprio celular.',
    language: 'Idioma da página',
    guest: 'Continuar como visitante',
    app: 'Entrar com o MuuZi',
    unavailable:
      'A participação por link ainda não está disponível. Continue no celular de quem fez o convite.',
    speech: 'O idioma que você vai falar será escolhido separadamente.',
    paste: 'Colar link do convite',
    apply: 'Abrir convite',
  },
};

var fieldGuestGateCopy = {
  zh: {
    checking: '正在检查邀请方的交流服务…',
    unavailable: '邀请方的交流服务暂不可用，请稍后重试或联系邀请人。',
    retry: '重新检查',
  },
  en: {
    checking: 'Checking your host’s conversation service…',
    unavailable:
      'Your host’s conversation service is unavailable. Try again later or contact your host.',
    retry: 'Check again',
  },
  ja: {
    checking: '招待者の会話サービスを確認中…',
    unavailable:
      '招待者の会話サービスは現在利用できません。後で再試行するか、招待者にご連絡ください。',
    retry: '再確認',
  },
  ko: {
    checking: '초대한 분의 대화 서비스를 확인 중입니다…',
    unavailable:
      '초대한 분의 대화 서비스를 현재 사용할 수 없습니다. 나중에 다시 시도하거나 초대한 분에게 문의하세요.',
    retry: '다시 확인',
  },
  fr: {
    checking: 'Vérification du service de conversation de votre hôte…',
    unavailable:
      'Le service de votre hôte est indisponible. Réessayez plus tard ou contactez votre hôte.',
    retry: 'Vérifier à nouveau',
  },
  de: {
    checking: 'Der Gesprächsdienst der einladenden Person wird geprüft…',
    unavailable:
      'Der Gesprächsdienst ist derzeit nicht verfügbar. Versuchen Sie es später erneut oder kontaktieren Sie die einladende Person.',
    retry: 'Erneut prüfen',
  },
  es: {
    checking: 'Comprobando el servicio de conversación de quien te invitó…',
    unavailable:
      'El servicio no está disponible. Inténtalo más tarde o contacta con quien te invitó.',
    retry: 'Volver a comprobar',
  },
  pt: {
    checking: 'Verificando o serviço de conversa de quem convidou você…',
    unavailable:
      'O serviço está indisponível. Tente mais tarde ou entre em contato com quem convidou você.',
    retry: 'Verificar novamente',
  },
};

function fieldJoinLanguage(preferences) {
  preferences = preferences || [];
  for (var i = 0; i < preferences.length; i++) {
    var base = String(preferences[i] || '')
      .trim()
      .replace(/_/g, '-')
      .split('-')[0]
      .toLowerCase();
    if (Object.prototype.hasOwnProperty.call(fieldJoinLanguages, base)) {
      return base;
    }
  }
  return 'en';
}

function languageOptions() {
  return Object.keys(fieldJoinLanguages).map(function (key) {
    return { value: key, label: fieldJoinLanguages[key] };
  });
}

module.exports = {
  fieldJoinLanguages: fieldJoinLanguages,
  fieldJoinCopy: fieldJoinCopy,
  fieldGuestGateCopy: fieldGuestGateCopy,
  fieldJoinLanguage: fieldJoinLanguage,
  languageOptions: languageOptions,
};
