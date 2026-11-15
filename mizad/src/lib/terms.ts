// Terms and Conditions text. Change PLATFORM here once and it updates everywhere.
// NOTE: this is a draft written to disclaim liability for listed products; have a UAE lawyer review it before launch.
export const PLATFORM = { ar: 'مزاد بوس', en: 'Mazad Boss' }
export const TERMS_UPDATED = '2026-11-15'

type Sec = { h: string; p: string[] }
export const TERMS: Record<'ar' | 'en', { title: string; intro: string; secs: Sec[] }> = {
  ar: {
    title: 'الشروط والأحكام',
    intro: `باستخدامك منصة «${PLATFORM.ar}» (“المنصة”) أو التسجيل فيها، سواء كنت مضيفاً أو مزايداً، فإنك تقر بأنك قرأت هذه الشروط وفهمتها وتوافق عليها. إذا لم توافق فلا تستخدم المنصة.`,
    secs: [
      { h: '1. دور المنصة', p: [`«${PLATFORM.ar}» منصة تقنية تعمل كمنظّم للمزاد فقط، وتوفّر الأدوات التي تتيح للمضيفين عرض منتجاتهم وللمزايدين تقديم عروضهم.`, 'المنصة ليست بائعاً ولا مشترياً ولا وسيطاً ولا وكيلاً ولا ضامناً في أي عملية بيع، وليست طرفاً في العقد الذي ينشأ بين المضيف والمزايد.'] },
      { h: '2. إخلاء المسؤولية عن المنتجات', p: ['المضيف وحده هو المسؤول عن المنتجات التي يعرضها، بما في ذلك وصفها وأصالتها وجودتها وحالتها وملكيتها وقانونية بيعها ومطابقتها للصور والمعلومات المعروضة.', 'لا تفحص المنصة المنتجات ولا تتحقق منها ولا تضمنها، ولا تتحمل أي مسؤولية عن أي عيب أو نقص أو تلف أو اختلاف في المنتج أو عن عدم تسليمه أو التأخر فيه.', 'على المزايد أن يتحقق بنفسه من المنتج والمضيف قبل المزايدة، وأن يتواصل مع المضيف مباشرة لأي استفسار.'] },
      { h: '3. المزايدات والبيع', p: ['كل مزايدة تُقدَّم عبر المنصة هي التزام ملزم بالشراء بالسعر المعروض إذا فاز المزايد بالمزاد.', 'يقرر المضيف قبول المزايدين أو إيقافهم، وله إغلاق المزاد أو إيقافه في أي وقت وفق ما تتيحه المنصة.', 'اتفاقيات الدفع والتسليم والاسترجاع تتم بين المضيف والمزايد مباشرة، والمنصة غير مسؤولة عنها.'] },
      { h: '4. الحسابات', p: ['أنت مسؤول عن صحة بياناتك وعن سرية كلمة المرور وعن كل نشاط يجري من خلال حسابك.', 'يجب أن تكون بالغاً وذا أهلية قانونية للتعاقد وفق القوانين المعمول بها في بلدك.', 'يجوز للمنصة تعليق أي حساب أو إنهاؤه عند مخالفة هذه الشروط أو إساءة الاستخدام.'] },
      { h: '5. المحتوى والمنتجات الممنوعة', p: ['يُمنع عرض أي منتج مخالف للقانون أو مسروق أو مقلّد أو يمس حقوق الآخرين، أو أي محتوى مضلل أو مسيء.', 'يتحمل المضيف كامل المسؤولية القانونية عن المحتوى والصور والمعلومات التي ينشرها.'] },
      { h: '6. الرسوم والمدفوعات', p: ['قد تفرض المنصة رسوماً على المضيفين مقابل الخدمة وفق الأسعار المعلنة داخل المنصة، وهي تُدفع بالدرهم الإماراتي.', 'الرسوم المدفوعة للمنصة هي مقابل استخدام الخدمة التقنية فقط ولا تُعد ضماناً لأي عملية بيع.', 'يختار المضيف عملة مزاداته، وهو مسؤول عن تحصيل المبالغ من الفائزين.'] },
      { h: '7. حدود المسؤولية', p: ['إلى أقصى حد يسمح به القانون، لا تتحمل المنصة ولا مالكوها ولا العاملون فيها أي مسؤولية عن أي خسارة أو ضرر مباشر أو غير مباشر ينتج عن استخدام المنصة أو عن أي مزاد أو منتج أو تعامل بين المستخدمين.', 'تُقدَّم المنصة “كما هي” دون أي ضمان بخلوها من الانقطاع أو الأخطاء.', 'يوافق المستخدم على تعويض المنصة وإبراء ذمتها من أي مطالبة تنشأ عن منتجاته أو عن مخالفته لهذه الشروط.'] },
      { h: '8. الخصوصية', p: ['نجمع الحد الأدنى من البيانات اللازمة لتشغيل الخدمة، مثل الاسم ورقم الهاتف والبريد الإلكتروني، ونعرض للمضيف بيانات المزايدين المقبولين لديه لإتمام البيع.', 'لا نبيع بياناتك لأطراف ثالثة.'] },
      { h: '9. التعديل والقانون الواجب التطبيق', p: ['يجوز للمنصة تعديل هذه الشروط في أي وقت، ويُعد استمرارك في الاستخدام موافقةً على النسخة المحدّثة.', 'تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة، وتختص محاكمها بأي نزاع ناشئ عنها.'] },
    ],
  },
  en: {
    title: 'Terms and Conditions',
    intro: `By using or registering on “${PLATFORM.en}” (the “Platform”), whether as a host or a bidder, you confirm that you have read, understood and agree to these Terms. If you do not agree, do not use the Platform.`,
    secs: [
      { h: '1. Role of the Platform', p: [`${PLATFORM.en} is a technology platform that acts solely as the organizer of the auction. It provides the tools that let hosts present their products and bidders place offers.`, 'The Platform is not a seller, buyer, broker, agent or guarantor in any sale, and is not a party to the contract formed between a host and a bidder.'] },
      { h: '2. Disclaimer about products', p: ['The host alone is responsible for the products they list, including their description, authenticity, quality, condition, ownership, the legality of their sale, and their match to the photos and information shown.', 'The Platform does not inspect, verify or guarantee any product, and accepts no liability for any defect, shortage, damage, difference, non-delivery or late delivery of a product.', 'Bidders must satisfy themselves about the product and the host before bidding and should contact the host directly with any question.'] },
      { h: '3. Bids and sales', p: ['Every bid placed through the Platform is a binding commitment to buy at the bid price if the bidder wins.', 'The host decides which bidders to accept or suspend, and may pause or close an auction at any time as the Platform allows.', 'Payment, delivery and return arrangements are made directly between host and bidder, and the Platform is not responsible for them.'] },
      { h: '4. Accounts', p: ['You are responsible for the accuracy of your details, the confidentiality of your password, and all activity under your account.', 'You must be an adult with legal capacity to enter contracts under the laws that apply to you.', 'The Platform may suspend or terminate any account that breaches these Terms or abuses the service.'] },
      { h: '5. Prohibited content and products', p: ['You must not list anything unlawful, stolen, counterfeit or infringing, or any misleading or offensive content.', 'The host bears full legal responsibility for the content, images and information they publish.'] },
      { h: '6. Fees and payments', p: ['The Platform may charge hosts service fees at the rates shown in the Platform. Platform fees are paid in UAE Dirham (AED).', 'Fees paid to the Platform are for the technology service only and are not a guarantee of any sale.', 'The host chooses the currency of their auctions and is responsible for collecting payment from winners.'] },
      { h: '7. Limitation of liability', p: ['To the fullest extent permitted by law, the Platform, its owners and staff are not liable for any direct or indirect loss or damage arising from use of the Platform or from any auction, product or dealing between users.', 'The Platform is provided “as is”, without any warranty that it will be uninterrupted or error-free.', 'You agree to indemnify and hold the Platform harmless from any claim arising from your products or your breach of these Terms.'] },
      { h: '8. Privacy', p: ['We collect the minimum data needed to run the service, such as name, phone number and email, and show a host the details of the bidders approved by that host so the sale can be completed.', 'We do not sell your data to third parties.'] },
      { h: '9. Changes and governing law', p: ['The Platform may update these Terms at any time. Continued use means you accept the updated version.', 'These Terms are governed by the laws of the United Arab Emirates, and its courts have jurisdiction over any dispute arising from them.'] },
    ],
  },
}
