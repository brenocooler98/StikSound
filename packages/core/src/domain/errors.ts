export type StikSoundErrorCode =
  | "unsupported-image"
  | "animated-webp-unsupported"
  | "unsupported-video"
  | "unsupported-audio"
  | "unsupported-codec"
  | "encode-failed"
  | "file-too-large"
  | "url-rejected"
  | "remote-unavailable"
  | "trim-out-of-range"
  | "sticker-too-large"
  | "package-invalid"
  | "export-unsupported";

export type LocaleCode = "es" | "en" | "pt" | "fr" | "de" | "it" | "ru" | "zh" | "ar";

export const SUPPORTED_LOCALES: readonly LocaleCode[] = [
  "es",
  "en",
  "pt",
  "fr",
  "de",
  "it",
  "ru",
  "zh",
  "ar"
] as const;

export const LOCALE_NATIVE_NAMES: Record<LocaleCode, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  ru: "Русский",
  zh: "中文",
  ar: "العربية"
};

export function detectLocale(rawLang?: string): LocaleCode {
  const normalized = (rawLang ?? "").trim().toLowerCase();
  if (!normalized) return "en";
  const prefix = normalized.split(/[-_]/)[0] ?? "";
  if ((SUPPORTED_LOCALES as readonly string[]).includes(prefix)) {
    return prefix as LocaleCode;
  }
  return "en";
}

export interface LocalizedErrorCopy {
  title: string;
  action: string;
}

export const ERROR_CATALOG: Record<StikSoundErrorCode, Record<LocaleCode, LocalizedErrorCopy>> = {
  "unsupported-image": {
    es: {
      title: "Este archivo no es una imagen compatible (usa PNG, WebP, JPG o GIF).",
      action: "Pega otra imagen con Ctrl+V/Cmd+V o arrastra un PNG o GIF."
    },
    en: {
      title: "This file is not a supported image (use PNG, WebP, JPG, or GIF).",
      action: "Paste another image or drop a PNG or GIF file."
    },
    pt: {
      title: "Este arquivo não é uma imagem compatível (use PNG, WebP, JPG ou GIF).",
      action: "Cole outra imagem com Ctrl+V/Cmd+V ou arraste um arquivo PNG ou GIF."
    },
    fr: {
      title: "Ce fichier n'est pas une image compatible (utilisez PNG, WebP, JPG ou GIF).",
      action: "Collez une autre image ou déposez un fichier PNG ou GIF."
    },
    de: {
      title: "Diese Datei ist kein unterstütztes Bild (nutze PNG, WebP, JPG oder GIF).",
      action: "Füge ein anderes Bild ein oder ziehe eine PNG- oder GIF-Datei hierher."
    },
    it: {
      title: "Questo file non è un'immagine supportata (usa PNG, WebP, JPG o GIF).",
      action: "Incolla un'altra immagine o trascina un file PNG o GIF."
    },
    ru: {
      title: "Этот файл не является поддерживаемым изображением (используйте PNG, WebP, JPG или GIF).",
      action: "Вставьте другое изображение или перетащите файл PNG или GIF."
    },
    zh: {
      title: "此文件不是受支持的图片格式（请使用 PNG、WebP、JPG 或 GIF）。",
      action: "请粘贴另一张图片或拖入 PNG 或 GIF 文件。"
    },
    ar: {
      title: "هذا الملف ليس صورة مدعومة (استخدم PNG أو WebP أو JPG أو GIF).",
      action: "الصق صورة أخرى أو اسحب ملف PNG أو GIF."
    }
  },
  "animated-webp-unsupported": {
    es: {
      title: "Un sticker animado (GIF o video) no se puede exportar como WebP estático.",
      action: "Descarga el video MP4/WebM (5 s o 10 s), o elige el paquete ZIP para usar el primer fotograma."
    },
    en: {
      title: "An animated sticker (GIF or video) cannot be exported as a static WebP.",
      action: "Download the MP4/WebM video (5s or 10s), or choose the ZIP bundle to use the first frame."
    },
    pt: {
      title: "Um sticker animado (GIF ou vídeo) não pode ser exportado como WebP estático.",
      action: "Baixe o vídeo MP4/WebM (5 s ou 10 s) ou escolha o pacote ZIP para usar o primeiro quadro."
    },
    fr: {
      title: "Un sticker animé (GIF ou vidéo) ne peut pas être exporté en WebP statique.",
      action: "Téléchargez la vidéo MP4/WebM (5 s ou 10 s), ou choisissez l'archive ZIP pour utiliser la première image."
    },
    de: {
      title: "Ein animierter Sticker (GIF oder Video) kann nicht als statisches WebP exportiert werden.",
      action: "Lade das MP4-/WebM-Video (5 s oder 10 s) herunter oder wähle das ZIP-Paket für das erste Bild."
    },
    it: {
      title: "Uno sticker animato (GIF o video) non può essere esportato come WebP statico.",
      action: "Scarica il video MP4/WebM (5 s o 10 s), oppure scegli il pacchetto ZIP per usare il primo fotogramma."
    },
    ru: {
      title: "Анимированный стикер (GIF или видео) нельзя экспортировать как статичный WebP.",
      action: "Скачайте видео MP4/WebM (5 с или 10 с) или выберите ZIP-пакет, чтобы использовать первый кадр."
    },
    zh: {
      title: "动态贴纸（GIF 或视频）无法导出为静态 WebP。",
      action: "请下载 MP4/WebM 视频（5 秒或 10 秒），或选择 ZIP 项目包以使用首帧图像。"
    },
    ar: {
      title: "لا يمكن تصدير الملصق المتحرك (GIF أو فيديو) كملصق WebP ثابت.",
      action: "نزّل فيديو MP4/WebM (5 أو 10 ثوانٍ)، أو اختر حزمة ZIP لاستخدام الإطار الأول."
    }
  },
  "unsupported-audio": {
    es: {
      title: "No se pudo leer este audio o el formato no es compatible.",
      action: "Usa un archivo MP3, WAV, OGG, M4A o pega un enlace de MyInstants o de un audio directo."
    },
    en: {
      title: "Could not decode this audio or the format is unsupported.",
      action: "Use an MP3, WAV, OGG, M4A file or paste a MyInstants or direct audio link."
    },
    pt: {
      title: "Não foi possível ler este áudio ou o formato não é compatível.",
      action: "Use um arquivo MP3, WAV, OGG, M4A ou cole um link do MyInstants ou de um áudio direto."
    },
    fr: {
      title: "Impossible de décoder cet audio ou format non pris en charge.",
      action: "Utilisez un fichier MP3, WAV, OGG, M4A ou collez un lien MyInstants valide."
    },
    de: {
      title: "Dieses Audio konnte nicht gelesen werden oder das Format wird nicht unterstützt.",
      action: "Verwende eine MP3-, WAV-, OGG-, M4A-Datei oder füge einen gültigen MyInstants-Link ein."
    },
    it: {
      title: "Impossibile decodificare questo audio o formato non supportato.",
      action: "Usa un file MP3, WAV, OGG, M4A o incolla un link MyInstants valido."
    },
    ru: {
      title: "Не удалось декодировать аудио или формат не поддерживается.",
      action: "Используйте файл MP3, WAV, OGG, M4A или вставьте корректную ссылку MyInstants."
    },
    zh: {
      title: "无法解码此音频或格式不受支持。",
      action: "请使用 MP3、WAV、OGG、M4A 文件或粘贴有效的 MyInstants 链接。"
    },
    ar: {
      title: "تعذرت قراءة هذا الملف الصوتي أو أن الصيغة غير مدعومة.",
      action: "استخدم ملف MP3 أو WAV أو OGG أو M4A أو الصق رابط MyInstants صالحًا."
    }
  },
  "unsupported-codec": {
    es: {
      title: "Este navegador no puede codificar el video o audio con los códecs disponibles.",
      action: "Descarga el paquete .stiksound.zip y ábrelo en la app de escritorio StikSound."
    },
    en: {
      title: "This browser build cannot encode this clip with its available codecs.",
      action: "Download the .stiksound.zip package and open it in the StikSound desktop app."
    },
    pt: {
      title: "Este navegador não consegue codificar o vídeo ou áudio com os codecs disponíveis.",
      action: "Baixe o pacote .stiksound.zip e abra-o no app de desktop StikSound."
    },
    fr: {
      title: "Ce navigateur ne peut pas encoder ce clip avec ses codecs disponibles.",
      action: "Téléchargez le paquet .stiksound.zip et ouvrez-le dans l'application bureau StikSound."
    },
    de: {
      title: "Dieser Browser kann den Clip mit den verfügbaren Codecs nicht kodieren.",
      action: "Lade das .stiksound.zip-Paket herunter und öffne es in der StikSound-Desktop-App."
    },
    it: {
      title: "Questo browser non può codificare il clip con i codec disponibili.",
      action: "Scarica il pacchetto .stiksound.zip e aprilo nell'app desktop StikSound."
    },
    ru: {
      title: "Этот браузер не может закодировать клип доступными кодеками.",
      action: "Скачайте пакет .stiksound.zip и откройте его в настольном приложении StikSound."
    },
    zh: {
      title: "当前浏览器无法使用可用编解码器编码此片段。",
      action: "请下载 .stiksound.zip 项目包并在 StikSound 桌面应用中打开。"
    },
    ar: {
      title: "لا يستطيع هذا المتصفح ترميز المقطع باستخدام برامج الترميز المتوفرة.",
      action: "نزّل حزمة .stiksound.zip وافتحها في تطبيق سطح المكتب StikSound."
    }
  },
  "encode-failed": {
    es: {
      title: "Ocurrió un error al generar el archivo final.",
      action: "Intenta cambiar el formato de salida en ⋯ o reintenta con otro archivo."
    },
    en: {
      title: "Failed while encoding the output file.",
      action: "Try switching the export format in ⋯ or retry with another input."
    },
    pt: {
      title: "Ocorreu um erro ao gerar o arquivo final.",
      action: "Tente alterar o formato de saída em ⋯ ou tente novamente com outro arquivo."
    },
    fr: {
      title: "Échec de l'encodage du fichier de sortie.",
      action: "Essayez de changer le format d'export dans ⋯ ou réessayez avec un autre fichier."
    },
    de: {
      title: "Fehler beim Kodieren der Ausgabedatei.",
      action: "Wechsle das Exportformat unter ⋯ oder versuche es mit einer anderen Datei."
    },
    it: {
      title: "Errore durante la codifica del file finale.",
      action: "Prova a cambiare formato di esportazione in ⋯ o riprova con un altro file."
    },
    ru: {
      title: "Не удалось закодировать итоговый файл.",
      action: "Попробуйте сменить формат экспорта в ⋯ или используйте другой файл."
    },
    zh: {
      title: "生成输出文件时发生编码错误。",
      action: "请尝试在 ⋯ 中切换导出格式，或换一个输入文件重试。"
    },
    ar: {
      title: "حدث خطأ أثناء ترميز الملف النهائي.",
      action: "جرّب تغيير صيغة التصدير من ⋯ أو أعد المحاولة بملف آخر."
    }
  },
  "unsupported-video": {
    es: {
      title: "Este video no se pudo abrir aquí.",
      action: "Prueba con un video MP4 o uno grabado con la cámara del teléfono."
    },
    en: {
      title: "This video could not be opened here.",
      action: "Try an MP4 video or one recorded with your phone camera."
    },
    pt: {
      title: "Não foi possível abrir este vídeo aqui.",
      action: "Tente um vídeo MP4 ou um gravado com a câmera do celular."
    },
    fr: {
      title: "Impossible d'ouvrir cette vidéo ici.",
      action: "Essayez une vidéo MP4 ou une vidéo filmée avec votre téléphone."
    },
    de: {
      title: "Dieses Video konnte hier nicht geöffnet werden.",
      action: "Versuche ein MP4-Video oder eines von deiner Handykamera."
    },
    it: {
      title: "Impossibile aprire questo video qui.",
      action: "Prova con un video MP4 o registrato con la fotocamera del telefono."
    },
    ru: {
      title: "Не удалось открыть это видео.",
      action: "Попробуйте видео в формате MP4 или снятое на камеру телефона."
    },
    zh: {
      title: "无法在此处打开此视频。",
      action: "请尝试使用 MP4 视频或手机相机拍摄的视频。"
    },
    ar: {
      title: "تعذر فتح هذا الفيديو هنا.",
      action: "جرّب فيديو بصيغة MP4 أو مقطعًا مسجلاً بكاميرا الهاتف."
    }
  },
  "file-too-large": {
    es: {
      title: "El archivo supera el límite permitido (20 MB imagen / 100 MB o 60 s video / 25 MB o 3 min audio).",
      action: "Usa un archivo más liviano o recórtalo previamente."
    },
    en: {
      title: "File exceeds the allowed size or duration limit (20 MB image / 100 MB or 60 s video / 25 MB or 3 min audio).",
      action: "Use a smaller file or trim it externally first."
    },
    pt: {
      title: "O arquivo excede o limite permitido (20 MB imagem / 100 MB ou 60 s vídeo / 25 MB ou 3 min áudio).",
      action: "Use um arquivo menor ou corte-o antes."
    },
    fr: {
      title: "Le fichier dépasse la limite autorisée (20 Mo image / 100 Mo ou 60 s vidéo / 25 Mo ou 3 min audio).",
      action: "Utilisez un fichier plus léger ou découpez-le au préalable."
    },
    de: {
      title: "Die Datei überschreitet das Limit (20 MB Bild / 100 MB oder 60 s Video / 25 MB oder 3 Min. Audio).",
      action: "Verwende eine kleinere Datei oder schneide sie vorher zu."
    },
    it: {
      title: "Il file supera il limite consentito (20 MB immagine / 100 MB o 60 s video / 25 MB o 3 min audio).",
      action: "Usa un file più leggero o taglialo prima."
    },
    ru: {
      title: "Файл превышает допустимый предел (20 МБ фото / 100 МБ или 60 с видео / 25 МБ или 3 мин аудио).",
      action: "Используйте файл меньшего размера или обрежьте его заранее."
    },
    zh: {
      title: "文件超出允许的大小或时长限制（图片 20 MB / 视频 100 MB 或 60 秒 / 音频 25 MB 或 3 分钟）。",
      action: "请使用更小的文件或先在外部裁剪。"
    },
    ar: {
      title: "يتجاوز الملف الحد المسموح به (20 م.ب للصورة / 100 م.ب أو 60 ث للفيديو / 25 م.ب أو 3 د للصوت).",
      action: "استخدم ملفًا أصغر حجمًا أو قم بقصه مسبقًا."
    }
  },
  "url-rejected": {
    es: {
      title: "Enlace rechazado por seguridad: solo se permiten URLs HTTPS públicas de MyInstants o de un archivo de audio directo.",
      action: "Copia el enlace de myinstants.com o un enlace HTTPS directo a un MP3, WAV, OGG o M4A e inténtalo de nuevo."
    },
    en: {
      title: "URL rejected by security policy: only public HTTPS links to MyInstants or a direct audio file are allowed.",
      action: "Copy a myinstants.com link or a direct HTTPS link to an MP3, WAV, OGG or M4A file and try again."
    },
    pt: {
      title: "Link rejeitado por segurança: apenas URLs HTTPS públicas do MyInstants ou de um arquivo de áudio direto são permitidas.",
      action: "Copie um link de myinstants.com ou um link HTTPS direto para um MP3, WAV, OGG ou M4A e tente novamente."
    },
    fr: {
      title: "URL rejetée par sécurité : seuls les liens HTTPS publics MyInstants ou vers un fichier audio direct sont autorisés.",
      action: "Copiez un lien myinstants.com ou un lien HTTPS direct vers un MP3, WAV, OGG ou M4A et réessayez."
    },
    de: {
      title: "URL aus Sicherheitsgründen abgelehnt: Nur öffentliche HTTPS-Links zu MyInstants oder direkt zu einer Audiodatei sind erlaubt.",
      action: "Kopiere einen myinstants.com-Link oder einen direkten HTTPS-Link zu einer MP3-, WAV-, OGG- oder M4A-Datei und versuche es erneut."
    },
    it: {
      title: "URL rifiutato per sicurezza: sono consentiti solo link HTTPS pubblici di MyInstants o a un file audio diretto.",
      action: "Copia un link myinstants.com o un link HTTPS diretto a un file MP3, WAV, OGG o M4A e riprova."
    },
    ru: {
      title: "Ссылка отклонена политикой безопасности: разрешены только публичные HTTPS-ссылки MyInstants или прямые ссылки на аудиофайл.",
      action: "Скопируйте ссылку myinstants.com или прямую HTTPS-ссылку на MP3, WAV, OGG или M4A и повторите попытку."
    },
    zh: {
      title: "出于安全策略已拒绝该链接：仅允许 MyInstants 或直接指向音频文件的公共 HTTPS 链接。",
      action: "请复制 myinstants.com 链接或直接指向 MP3、WAV、OGG、M4A 文件的 HTTPS 链接后重试。"
    },
    ar: {
      title: "تم رفض الرابط لأسباب أمنية: يُسمح فقط بروابط HTTPS العامة من MyInstants أو المباشرة لملف صوتي.",
      action: "انسخ رابط myinstants.com أو رابط HTTPS مباشرًا لملف MP3 أو WAV أو OGG أو M4A وحاول مرة أخرى."
    }
  },
  "remote-unavailable": {
    es: {
      title: "No se pudo obtener el sonido desde el enlace.",
      action: "Verifica tu conexión o que el sonido siga disponible (en la versión web, el sitio debe permitir descargas CORS), o usa un audio local."
    },
    en: {
      title: "Could not retrieve the sound from the link.",
      action: "Check your connection or that the sound still exists (on the web version the site must allow CORS downloads), or drop a local audio file."
    },
    pt: {
      title: "Não foi possível obter o som do link.",
      action: "Verifique sua conexão ou se o som ainda existe (na versão web o site precisa permitir downloads CORS), ou use um áudio local."
    },
    fr: {
      title: "Impossible de récupérer le son depuis le lien.",
      action: "Vérifiez votre connexion ou la disponibilité du son (en version web, le site doit autoriser CORS), ou utilisez un fichier local."
    },
    de: {
      title: "Der Ton konnte nicht über den Link geladen werden.",
      action: "Prüfe deine Verbindung oder ob der Sound noch existiert (in der Web-Version muss die Seite CORS erlauben), oder nutze eine lokale Datei."
    },
    it: {
      title: "Impossibile recuperare l'audio dal link.",
      action: "Controlla la connessione o che il suono sia disponibile (nella versione web il sito deve consentire CORS), oppure usa un file locale."
    },
    ru: {
      title: "Не удалось загрузить звук по ссылке.",
      action: "Проверьте подключение и доступность звука (в веб-версии сайт должен разрешать CORS) или используйте локальный аудиофайл."
    },
    zh: {
      title: "无法通过该链接获取声音。",
      action: "请检查网络连接或确认该声音仍可用（网页版要求该网站允许 CORS 下载），或改用本地音频文件。"
    },
    ar: {
      title: "تعذر جلب الصوت من الرابط.",
      action: "تحقق من اتصالك أو من أن الصوت ما زال متاحًا (في نسخة الويب يجب أن يسمح الموقع بـ CORS)، أو استخدم ملفًا صوتيًا محليًا."
    }
  },
  "trim-out-of-range": {
    es: {
      title: "El fragmento seleccionado debe durar entre 0.1 s y el máximo elegido (5 s o 10 s).",
      action: "Ajusta la barra de tiempo para que la selección quepa en 5 o 10 segundos."
    },
    en: {
      title: "The selected audio range must be between 0.1 s and the selected maximum (5 s or 10 s).",
      action: "Adjust the timeline so the selection fits within 5 or 10 seconds."
    },
    pt: {
      title: "O trecho selecionado deve durar entre 0,1 s e o máximo escolhido (5 s ou 10 s).",
      action: "Ajuste a barra de tempo para que a seleção caiba em 5 ou 10 segundos."
    },
    fr: {
      title: "La plage audio sélectionnée doit durer entre 0,1 s et le maximum choisi (5 s ou 10 s).",
      action: "Ajustez la barre de temps pour que la sélection tienne dans 5 ou 10 secondes."
    },
    de: {
      title: "Der ausgewählte Audiobereich muss zwischen 0,1 s und dem gewählten Maximum (5 s oder 10 s) liegen.",
      action: "Passe die Zeitleiste so an, dass die Auswahl in 5 oder 10 Sekunden passt."
    },
    it: {
      title: "Il frammento selezionato deve durare tra 0,1 s e il massimo scelto (5 s o 10 s).",
      action: "Regola la barra temporale affinché la selezione rientri in 5 o 10 secondi."
    },
    ru: {
      title: "Выбранный фрагмент должен длиться от 0,1 с до выбранного максимума (5 с или 10 с).",
      action: "Настройте шкалу времени так, чтобы фрагмент уложился в 5 или 10 секунд."
    },
    zh: {
      title: "所选音频片段的时长必须在 0.1 秒至所选上限（5 秒或 10 秒）之间。",
      action: "请调整时间轴，使所选范围在 5 秒或 10 秒以内。"
    },
    ar: {
      title: "يجب أن تتراوح مدة المقطع المحدد بين 0.1 ثانية والحد الأقصى المختار (5 أو 10 ثوانٍ).",
      action: "اضبط شريط الوقت بحيث يناسب التحديد 5 أو 10 ثوانٍ."
    }
  },
  "sticker-too-large": {
    es: {
      title: "El sticker WebP supera el límite de 100 KB requerido por WhatsApp.",
      action: "Exporta como video (5 s o 10 s) o usa una imagen más simple."
    },
    en: {
      title: "The WebP sticker could not fit under WhatsApp's 100 KB limit.",
      action: "Export as a 5s or 10s video or try a simpler image."
    },
    pt: {
      title: "O sticker WebP excede o limite de 100 KB exigido pelo WhatsApp.",
      action: "Exporte como vídeo (5 s ou 10 s) ou use uma imagem mais simples."
    },
    fr: {
      title: "Le sticker WebP dépasse la limite de 100 Ko requise par WhatsApp.",
      action: "Exportez en vidéo (5 s ou 10 s) ou essayez une image plus simple."
    },
    de: {
      title: "Der WebP-Sticker überschreitet das 100-KB-Limit von WhatsApp.",
      action: "Exportiere als 5s- oder 10s-Video oder wähle ein einfacheres Bild."
    },
    it: {
      title: "Lo sticker WebP supera il limite di 100 KB richiesto da WhatsApp.",
      action: "Esporta come video (5 s o 10 s) o usa un'immagine più semplice."
    },
    ru: {
      title: "Стикер WebP превышает лимит WhatsApp в 100 КБ.",
      action: "Экспортируйте как видео (5 с или 10 с) или выберите более простое изображение."
    },
    zh: {
      title: "WebP 贴纸超过了 WhatsApp 要求的 100 KB 限制。",
      action: "请导出为 5 秒或 10 秒视频，或使用更简单的图片。"
    },
    ar: {
      title: "يتجاوز ملصق WebP حد 100 كيلوبايت المطلوب في واتساب.",
      action: "صدّر كفيديو (5 أو 10 ثوانٍ) أو استخدم صورة أبسط."
    }
  },
  "package-invalid": {
    es: {
      title: "El paquete .stiksound.zip es inválido o contiene rutas inseguras.",
      action: "Verifica que sea un proyecto exportado por StikSound sin alteraciones."
    },
    en: {
      title: "The .stiksound.zip package is invalid or contains unsafe paths.",
      action: "Ensure this is an unmodified StikSound project package."
    },
    pt: {
      title: "O pacote .stiksound.zip é inválido ou contém caminhos inseguros.",
      action: "Verifique se é um projeto exportado pelo StikSound sem alterações."
    },
    fr: {
      title: "Le paquet .stiksound.zip est invalide ou contient des chemins non sécurisés.",
      action: "Assurez-vous qu'il s'agit d'un projet StikSound non modifié."
    },
    de: {
      title: "Das .stiksound.zip-Paket ist ungültig oder enthält unsichere Pfade.",
      action: "Stelle sicher, dass es ein unverändertes StikSound-Projektpaket ist."
    },
    it: {
      title: "Il pacchetto .stiksound.zip non è valido o contiene percorsi non sicuri.",
      action: "Verifica che sia un progetto StikSound non modificato."
    },
    ru: {
      title: "Пакет .stiksound.zip повреждён или содержит небезопасные пути.",
      action: "Убедитесь, что это неизменённый пакет проекта StikSound."
    },
    zh: {
      title: ".stiksound.zip 项目包无效或包含不安全的路径。",
      action: "请确认这是未经修改的 StikSound 项目包。"
    },
    ar: {
      title: "حزمة .stiksound.zip غير صالحة أو تحتوي على مسارات غير آمنة.",
      action: "تأكد من أنها حزمة مشروع StikSound أصلية غير معدّلة."
    }
  },
  "export-unsupported": {
    es: {
      title: "La exportación nativa directa a WhatsApp aún no está disponible.",
      action: "El MP4 es un video, no un sticker: pegarlo o compartirlo en el chat lo envía como video. Solo en algunas cuentas de la beta de Android, no documentada de forma oficial, se puede probar Crear sticker eligiendo el video en la galería; la duración y el audio los decide WhatsApp."
    },
    en: {
      title: "Direct native WhatsApp sticker export is not supported yet.",
      action: "The MP4 is a video, not a sticker: pasting or sharing it in the chat sends it as a video. Only on some Android beta accounts, which are not officially documented, can you try Create sticker and pick the video from the gallery; WhatsApp decides the duration and audio."
    },
    pt: {
      title: "A exportação nativa direta para o WhatsApp ainda não está disponível.",
      action: "O MP4 é um vídeo, não um sticker: colar ou compartilhar no chat envia como vídeo. Apenas em algumas contas beta do Android (não documentadas oficialmente) é possível testar Criar figurinha escolhendo o vídeo na galeria; a duração e o áudio são decididos pelo WhatsApp."
    },
    fr: {
      title: "L'export natif direct vers WhatsApp n'est pas encore disponible.",
      action: "Le MP4 est une vidéo, pas un sticker : le coller ou le partager dans le chat l'envoie comme vidéo. Seuls certains comptes bêta Android non documentés permettent d'essayer Créer un sticker depuis la galerie ; WhatsApp décide de la durée et de l'audio."
    },
    de: {
      title: "Der direkte native WhatsApp-Sticker-Export wird noch nicht unterstützt.",
      action: "Die MP4-Datei ist ein Video, kein Sticker: Beim Einfügen oder Teilen wird sie als Video gesendet. Nur auf einigen inoffiziellen Android-Beta-Konten lässt sich Sticker erstellen aus der Galerie testen; Dauer und Ton bestimmt WhatsApp."
    },
    it: {
      title: "L'esportazione nativa diretta su WhatsApp non è ancora disponibile.",
      action: "L'MP4 è un video, non uno sticker: incollarlo o condividerlo in chat lo invia come video. Solo su alcuni account beta Android non documentati è possibile provare Crea sticker dalla galleria; durata e audio sono decisi da WhatsApp."
    },
    ru: {
      title: "Прямой нативный экспорт стикеров в WhatsApp пока не поддерживается.",
      action: "MP4 — это видео, а не стикер: при вставке или отправке в чат оно уходит как видео. Лишь на некоторых неофициальных бета-аккаунтах Android можно попробовать создать стикер из галереи; длительность и звук определяет WhatsApp."
    },
    zh: {
      title: "暂不支持直接导出为 WhatsApp 原生有声贴纸。",
      action: "导出的 MP4 是视频而非贴纸：粘贴或分享到聊天中会作为视频发送。仅部分未公开记录的 Android 测试版账号可尝试从相册创建贴纸，时长和音频均由 WhatsApp 决定。"
    },
    ar: {
      title: "التصدير الأصلي المباشر كملصق واتساب غير مدعوم بعد.",
      action: "ملف MP4 هو فيديو وليس ملصقًا: لصقه أو مشاركته في الدردشة يرسله كفيديو. في بعض حسابات بيتا أندرويد غير الموثقة رسميًا فقط يمكنك تجربة إنشاء ملصق من المعرض، ويحدد واتساب المدة والصوت."
    }
  }
};

export class StikSoundError extends Error {
  public readonly code: StikSoundErrorCode;
  public readonly detail?: string;

  constructor(code: StikSoundErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "StikSoundError";
    this.code = code;
    this.detail = detail;
  }

  public getLocalized(locale: LocaleCode): LocalizedErrorCopy {
    return ERROR_CATALOG[this.code][locale];
  }
}

export function formatError(err: unknown, locale: LocaleCode): LocalizedErrorCopy & { code: StikSoundErrorCode } {
  if (err instanceof StikSoundError) {
    return { code: err.code, ...err.getLocalized(locale) };
  }
  return {
    code: "encode-failed",
    ...ERROR_CATALOG["encode-failed"][locale]
  };
}
