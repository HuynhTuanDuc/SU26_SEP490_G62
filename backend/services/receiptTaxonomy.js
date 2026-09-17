/**
 * Từ điển hạng mục bảo dưỡng + bộ so khớp tên hàng.
 *
 * Thuần hàm, không I/O, không phụ thuộc DB — để test được toàn bộ mà không cần dựng
 * cơ sở dữ liệu. Phần mở rộng lúc chạy nằm ở bảng `maintenance_item_keywords` và được
 * hợp nhất vào đây qua tham số `extraKeywords`.
 *
 * Vì sao cần từ điển riêng khi model đã tự đề xuất được hạng mục: hai đường độc lập
 * rồi đối chiếu thì phát hiện được lúc một bên sai. Từ điển còn là thứ KIỂM TOÁN được
 * — giải thích cho tài xế bị từ chối rằng "xăng" thuộc loại chi phí Nhiên liệu thì
 * chỉ ra được dòng luật, còn "model bảo thế" thì không.
 */

const MAINTENANCE = 'maintenance';
const EXCLUDED = 'excluded';

/**
 * Chuẩn hoá chuỗi tiếng Việt về dạng so khớp: bỏ dấu, chữ thường, gộp khoảng trắng.
 *
 * `đ` không bị NFD tách ra (nó là ký tự riêng U+0111, không phải d + dấu gạch) nên
 * phải thay tay sau bước bỏ dấu, nếu không "dầu" và "đầu" sẽ không gộp về một dạng.
 */
const normalize = (value) => String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Danh sách gốc. Mỗi mục: mã hạng mục, nhóm, nhãn tiếng Việt để hiển thị, và các từ
 * khoá ĐÃ Ở DẠNG CHUẨN HOÁ (không dấu, chữ thường).
 *
 * Cố ý KHÔNG đưa từ khoá cụt như "dau" vào: nó khớp cả "dầu nhớt" (bảo dưỡng) lẫn
 * "dầu diesel" (nhiên liệu) — hai nhóm ngược nhau. Luôn dùng cụm đủ nghĩa.
 */
const DEFAULT_TAXONOMY = [
    // ─── Thuộc bảo dưỡng ────────────────────────────────────────────────────
    {
        category: 'engine_oil', group: MAINTENANCE, label: 'Dầu nhớt động cơ',
        keywords: ['nhot', 'dau nhot', 'dau dong co', 'dau may', 'castrol', 'shell helix',
            'motul', 'total quartz', 'engine oil', 'thay nhot', 'thay dau may'],
    },
    {
        category: 'filter', group: MAINTENANCE, label: 'Lọc',
        keywords: ['loc dau', 'loc dau dong co', 'loc dau may', 'loc nhot', 'loc gio', 'loc gio dong co', 'loc nhien lieu',
            'loc dieu hoa', 'loc xang', 'loc tach nuoc', 'coc loc', 'oil filter',
            'air filter', 'fuel filter'],
    },
    {
        category: 'brake', group: MAINTENANCE, label: 'Hệ thống phanh',
        keywords: ['ma phanh', 'bo thang', 'guoc phanh', 'dia phanh', 'dau phanh',
            'cum phanh', 'xi lanh phanh', 'brake pad', 'thang xe'],
    },
    {
        category: 'tire', group: MAINTENANCE, label: 'Lốp và bánh xe',
        keywords: ['lop', 'lop xe', 'vo xe', 'sam xe', 'ruot xe', 'va lop',
            'can bang dong', 'dao lop', 'bom lop', 'van lop', 'mam xe', 'la zang',
            'lazang', 'tire', 'tyre'],
    },
    {
        category: 'battery_electric', group: MAINTENANCE, label: 'Điện và ắc quy',
        keywords: ['ac quy', 'binh dien', 'bugi', 'may phat dien', 'cu de', 'motor de',
            'bong den', 'den pha', 'den hau', 'day dien', 'cau chi', 'ro le', 'relay',
            'battery', 'spark plug'],
    },
    {
        category: 'fluid', group: MAINTENANCE, label: 'Dung dịch và dầu hộp số',
        keywords: ['nuoc lam mat', 'dung dich lam mat', 'coolant',
            'dau hop so', 'dau cau', 'dau tro luc', 'dau ly hop', 'nuoc rua kinh',
            'mo bo', 'mo boi tron', 'gioang', 'phot'],
    },
    {
        category: 'belt_chain', group: MAINTENANCE, label: 'Dây curoa và xích cam',
        keywords: ['day curoa', 'curoa', 'day cu roa', 'xich cam', 'bo cang day',
            'puly', 'bi tang'],
    },
    {
        category: 'suspension_steering', group: MAINTENANCE, label: 'Gầm và lái',
        keywords: ['giam xoc', 'phuoc', 'phuoc nhun', 'nhip', 'la nhip', 'rotuyn',
            'ro tuyn', 'thuoc lai', 'can chinh thuoc lai', 'can chinh goc lai',
            'bi may o', 'bac dan', 'cao su chan', 'can bang lai'],
    },
    {
        category: 'body_repair', group: MAINTENANCE, label: 'Đồng sơn và thân vỏ',
        keywords: ['dong son', 'go han', 'son xe', 'kinh chan gio', 'gat mua',
            'can truoc', 'can sau', 'guong chieu hau', 'thung xe', 'ba do soc'],
    },
    {
        category: 'labor', group: MAINTENANCE, label: 'Tiền công',
        keywords: ['tien cong', 'cong tho', 'nhan cong', 'cong thay', 'cong sua',
            'cong lap dat', 'cong thao lap', 'phi dich vu sua chua', 'cong bao duong'],
    },
    {
        category: 'inspection', group: MAINTENANCE, label: 'Đăng kiểm',
        keywords: ['dang kiem', 'kiem dinh', 'phi kiem dinh', 'tem kiem dinh',
            'kiem tra khi thai'],
    },
    {
        category: 'other_maintenance', group: MAINTENANCE, label: 'Vật tư bảo dưỡng khác',
        keywords: ['bao duong', 'sua chua', 'vat tu', 'phu tung', 'thay the',
            'bao tri', 'oc vit', 'bulong', 'bu long'],
    },

    // ─── KHÔNG thuộc bảo dưỡng ──────────────────────────────────────────────
    // Nhóm này tồn tại để TỪ CHỐI CÓ LÝ DO, không phải để bỏ qua: hóa đơn xăng là
    // hóa đơn thật, chỉ là phải khai vào đúng loại chi phí khác.
    {
        category: 'fuel', group: EXCLUDED, label: 'Nhiên liệu',
        keywords: ['xang', 'xang a95', 'xang ron', 'dau diesel', 'diesel', 'dau do',
            'nhien lieu', 'do xang', 'do dau', 'petrolimex', 'cay xang', 'gas',
            'khi hoa long'],
    },
    {
        category: 'toll', group: EXCLUDED, label: 'Phí cầu đường',
        keywords: ['cau duong', 'phi duong bo', 'bot', 'tram thu phi', 've cau',
            've duong', 'etc', 'phi qua tram'],
    },
    {
        category: 'parking', group: EXCLUDED, label: 'Phí đỗ xe và bến bãi',
        keywords: ['do xe', 'giu xe', 'ben bai', 'phi ben', 'trong giu xe'],
    },
    {
        category: 'food', group: EXCLUDED, label: 'Ăn uống',
        keywords: ['an uong', 'com trua', 'com toi', 'pho bo', 'bun', 'ca phe', 'cafe',
            'nuoc ngot', 'nuoc suoi', 'bia', 'thuoc la', 'banh mi', 'tra da'],
    },
    {
        category: 'carwash', group: EXCLUDED, label: 'Rửa xe',
        keywords: ['rua xe', 've sinh xe', 'danh bong', 'hut bui xe'],
    },
];

/** Mọi mã hạng mục hợp lệ — dùng để ràng buộc giá trị model được phép trả về. */
const ALL_CATEGORIES = DEFAULT_TAXONOMY.map((entry) => entry.category);

const GROUP_BY_CATEGORY = Object.fromEntries(
    DEFAULT_TAXONOMY.map((entry) => [entry.category, entry.group]),
);
const LABEL_BY_CATEGORY = Object.fromEntries(
    DEFAULT_TAXONOMY.map((entry) => [entry.category, entry.label]),
);

/**
 * Dựng bảng tra từ khoá -> hạng mục, gộp danh sách gốc với phần mở rộng lấy từ DB.
 *
 * Từ khoá trùng thì bản của DB thắng — đó là cách sửa một phân loại sai mà không phải
 * chờ deploy.
 *
 * @param {Array<{keyword: string, category: string, item_group: string}>} extraKeywords
 * @returns {Array<{keyword: string, category: string, group: string, length: number}>}
 */
const buildKeywordIndex = (extraKeywords = []) => {
    const index = new Map();

    for (const entry of DEFAULT_TAXONOMY) {
        for (const keyword of entry.keywords) {
            const key = normalize(keyword);
            if (key) index.set(key, { keyword: key, category: entry.category, group: entry.group });
        }
    }

    for (const row of extraKeywords) {
        const key = normalize(row?.keyword);
        const group = row?.item_group ?? row?.group;
        if (!key || !row?.category || (group !== MAINTENANCE && group !== EXCLUDED)) continue;
        index.set(key, { keyword: key, category: row.category, group });
    }

    // Sắp từ dài đến ngắn: "dau diesel" phải được thử trước "diesel", và "loc dau"
    // trước "dau nhot" — cụm dài hơn là cụm cụ thể hơn, phải thắng.
    return [...index.values()]
        .map((entry) => ({ ...entry, length: entry.keyword.length }))
        .sort((a, b) => b.length - a.length);
};

/**
 * Tìm hạng mục cho một tên hàng bằng từ điển.
 *
 * So khớp theo biên từ chứ không phải chuỗi con tự do: "bun" (ăn uống) không được
 * khớp vào "bundle", "gas" không được khớp vào "gasket".
 *
 * @returns {{category: string, group: string, keyword: string}|null}
 */
const matchCategory = (rawName, keywordIndex) => {
    const text = normalize(rawName);
    if (!text) return null;

    for (const entry of keywordIndex) {
        const pattern = new RegExp('(^|[^a-z0-9])' + entry.keyword + '([^a-z0-9]|$)');
        if (pattern.test(text)) {
            return { category: entry.category, group: entry.group, keyword: entry.keyword };
        }
    }
    return null;
};

/** Nhóm của một mã hạng mục do model đề xuất; null nếu mã không hợp lệ. */
const groupOfCategory = (category) => GROUP_BY_CATEGORY[category] ?? null;

/** Nhãn tiếng Việt để hiển thị cho người dùng. */
const labelOfCategory = (category) => LABEL_BY_CATEGORY[category] ?? category;

// ─── Hồ sơ theo loại chi phí ─────────────────────────────────────────────────

const MAINTENANCE_CATEGORIES = DEFAULT_TAXONOMY
    .filter((entry) => entry.group === MAINTENANCE)
    .map((entry) => entry.category);

/**
 * Hạng mục nào được coi là ĐÚNG CHỦ ĐỀ cho từng loại chi phí.
 *
 * Hiện chỉ luồng BẢO DƯỠNG chạy dây chuyền đọc hóa đơn (chi phí chuyến không quét). Các
 * hồ sơ còn lại vẫn giữ vì câu từ chối OFF_TOPIC_INVOICE dùng chúng để chỉ đúng loại chi
 * phí phải khai — "hóa đơn xăng → khai vào Nhiên liệu" (receiptChecks.checkCategories).
 *
 * `accepted: null` nghĩa là KHÔNG kiểm tra hạng mục — với các loại chi phí không có
 * danh mục hàng hóa đặc trưng (khấu hao, khác) thì mọi tên hàng đều có thể đúng, và
 * các lớp còn lại (đúng loại chứng từ, số học, khớp số khai) vẫn chạy đủ.
 */
const EXPENSE_PROFILES = {
    maintenance: { label: 'bảo dưỡng', accepted: MAINTENANCE_CATEGORIES },
    repair: { label: 'sửa chữa xe', accepted: MAINTENANCE_CATEGORIES },
    fuel: { label: 'nhiên liệu', accepted: ['fuel'] },
    toll: { label: 'phí cầu đường', accepted: ['toll'] },
    parking: { label: 'phí đỗ xe', accepted: ['parking'] },
    etc: { label: 'phí ETC', accepted: ['toll'] },
    depreciation: { label: 'khấu hao', accepted: null },
    other: { label: 'chi phí khác', accepted: null },
};

const DEFAULT_PROFILE = EXPENSE_PROFILES.maintenance;

/** Hồ sơ của một loại chi phí; loại lạ thì rơi về hồ sơ bảo dưỡng. */
const getProfile = (code) => EXPENSE_PROFILES[code] ?? DEFAULT_PROFILE;

/**
 * Danh mục hạng mục để giao diện dựng ô chọn khi người duyệt sửa phân loại một dòng.
 *
 * Sinh từ chính DEFAULT_TAXONOMY chứ không chép tay sang frontend: chép tay thì thêm
 * một hạng mục là phải nhớ sửa hai nơi, và bản sao lệch đi thì người duyệt chọn được
 * một mã mà backend sẽ lặng lẽ loại bỏ.
 *
 * `on_topic` phụ thuộc hồ sơ đang xét — "Nhiên liệu" là đúng chủ đề trên hóa đơn xăng
 * và sai chủ đề trên hóa đơn bảo dưỡng, nên nhãn cảnh báo phải do backend quyết.
 */
const categoryOptions = (profileCode) => {
    const profile = getProfile(profileCode);
    const accepted = profile.accepted ? new Set(profile.accepted) : null;
    return DEFAULT_TAXONOMY.map((entry) => ({
        value: entry.category,
        label: entry.label,
        group: entry.group,
        on_topic: accepted === null ? true : accepted.has(entry.category),
    }));
};

module.exports = {
    MAINTENANCE,
    EXCLUDED,
    DEFAULT_TAXONOMY,
    ALL_CATEGORIES,
    normalize,
    buildKeywordIndex,
    matchCategory,
    groupOfCategory,
    labelOfCategory,
    EXPENSE_PROFILES,
    getProfile,
    categoryOptions,
};
