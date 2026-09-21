/**
 * L1 Unit Test — chatbotKnowledge (tra tài liệu nghiệp vụ, BM25-lite)
 *
 * Mock đúng một thứ: fs.readFileSync (I/O đĩa). Toàn bộ việc chia mục theo heading,
 * tách từ, loại từ dừng và chấm điểm được chạy THẬT.
 *
 * Module cache chunks ở cấp module nên mỗi ca phải gọi _reload() — chính API mà
 * module cung cấp cho việc này.
 */
const fs = require('fs');
const knowledge = require('../../services/chatbotKnowledge');

const TAI_LIEU = [
    // Mục 1 cố ý nhắc "phiếu thu" trong NỘI DUNG nhưng không có trong TIÊU ĐỀ —
    // dùng để đo riêng phần thưởng điểm cho từ khoá nằm ở tiêu đề (xem TC-020).
    '# Quy trình bảo dưỡng xe',
    'Tài xế gửi yêu cầu bảo dưỡng, quản lý duyệt, tải hóa đơn lên hệ thống rồi mới gửi phiếu thu.',
    '',
    '## Phiếu thu tiền mặt',
    'Tài xế cuối của đơn hàng tiền mặt phải nhập số km thực tế rồi gửi yêu cầu tạo phiếu thu cho điều phối.',
    '',
    '## Công nợ khách hàng',
    'Khi khách chưa thanh toán, tài xế báo nợ và kế toán theo dõi công nợ cho tới khi thu hồi xong khoản đó.',
    '',
    '## Mục ngắn',
    'quá ngắn',
].join('\n');

const dungTaiLieu = (noiDung = TAI_LIEU) => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(noiDung);
};

beforeEach(() => {
    jest.restoreAllMocks();
    knowledge._reload();
});

afterEach(() => jest.restoreAllMocks());

describe('chatbotKnowledge.search — tìm mục liên quan', () => {
    it('TC-UNIT-ChatbotKnowledge-001 — finds the right section by a keyword in its heading', () => {
        dungTaiLieu();

        const kq = knowledge.search('bảo dưỡng');

        expect(kq.length).toBeGreaterThan(0);
        expect(kq[0].heading).toBe('Quy trình bảo dưỡng xe');
    });

    it('TC-UNIT-ChatbotKnowledge-002 — finds a section by a keyword in its body', () => {
        dungTaiLieu();

        const kq = knowledge.search('công nợ');

        expect(kq[0].heading).toBe('Công nợ khách hàng');
        expect(kq[0].score).toBeGreaterThan(0);
    });

    it('TC-UNIT-ChatbotKnowledge-020 — a keyword in the HEADING scores extra and beats a section that only mentions it in the body', () => {
        // Cả hai mục đều chứa "phiếu thu" trong nội dung, nên nếu bỏ phần thưởng điểm
        // cho tiêu đề thì hai mục hoà điểm và mục "Quy trình bảo dưỡng xe" (đứng trước
        // trong tài liệu) sẽ lên đầu. Test này chỉ xanh khi phần thưởng tiêu đề còn.
        dungTaiLieu();

        const kq = knowledge.search('phiếu thu');
        const boiCanh = kq.map((c) => c.heading);

        expect(boiCanh).toContain('Quy trình bảo dưỡng xe');
        expect(kq[0].heading).toBe('Phiếu thu tiền mặt');
        expect(kq[0].score).toBeGreaterThan(kq[1].score);
    });

    it('TC-UNIT-ChatbotKnowledge-003 — returns the results sorted by descending score', () => {
        dungTaiLieu();

        const kq = knowledge.search('tài xế phiếu thu');

        for (let i = 1; i < kq.length; i += 1) {
            expect(kq[i - 1].score).toBeGreaterThanOrEqual(kq[i].score);
        }
    });

    it('TC-UNIT-ChatbotKnowledge-004 — limits the number of sections returned by topK', () => {
        dungTaiLieu();

        expect(knowledge.search('tài xế', 1)).toHaveLength(1);
        expect(knowledge.search('tài xế', 2)).toHaveLength(2);
    });

    it('TC-UNIT-ChatbotKnowledge-005 — returns at most 3 sections by default', () => {
        dungTaiLieu();

        expect(knowledge.search('tài xế').length).toBeLessThanOrEqual(3);
    });

    it('TC-UNIT-ChatbotKnowledge-006 — a section matching no keyword is dropped from the results', () => {
        dungTaiLieu();

        const kq = knowledge.search('bảo dưỡng');

        expect(kq.every((c) => c.score > 0)).toBe(true);
        expect(kq.map((c) => c.heading)).not.toContain('Phiếu thu tiền mặt');
    });

    it('TC-UNIT-ChatbotKnowledge-007 — a question matching nothing returns an empty array', () => {
        dungTaiLieu();

        expect(knowledge.search('tàu ngầm hạt nhân')).toEqual([]);
    });

    it('TC-UNIT-ChatbotKnowledge-008 — a question made only of stop words returns an empty array', () => {
        dungTaiLieu();

        expect(knowledge.search('và là của các')).toEqual([]);
    });

    it('TC-UNIT-ChatbotKnowledge-009 — an empty question returns an empty array', () => {
        dungTaiLieu();

        expect(knowledge.search('')).toEqual([]);
        expect(knowledge.search('   ')).toEqual([]);
    });

    it('TC-UNIT-ChatbotKnowledge-010 — single characters are dropped and never become keywords', () => {
        dungTaiLieu();

        expect(knowledge.search('a b c')).toEqual([]);
    });

    it('TC-UNIT-ChatbotKnowledge-011 — matching is case-insensitive', () => {
        dungTaiLieu();

        expect(knowledge.search('BẢO DƯỠNG')[0].heading).toBe('Quy trình bảo dưỡng xe');
    });

    it('TC-UNIT-ChatbotKnowledge-012 — punctuation in the question does not affect the result', () => {
        dungTaiLieu();

        expect(knowledge.search('bảo dưỡng?!, xe.')[0].heading).toBe('Quy trình bảo dưỡng xe');
    });

    it('TC-UNIT-ChatbotKnowledge-013 — a section under 40 characters never enters the knowledge base', () => {
        dungTaiLieu();

        expect(knowledge.search('ngắn').map((c) => c.heading)).not.toContain('Mục ngắn');
    });

    it('TC-UNIT-ChatbotKnowledge-014 — returns the heading, the body and the score', () => {
        dungTaiLieu();

        const [top] = knowledge.search('bảo dưỡng');

        expect(top).toEqual({
            heading: 'Quy trình bảo dưỡng xe',
            text: expect.stringContaining('Tài xế gửi yêu cầu bảo dưỡng'),
            score: expect.any(Number),
        });
    });
});

describe('chatbotKnowledge — nạp tài liệu và cache', () => {
    it('TC-UNIT-ChatbotKnowledge-015 — reads the file ONCE however many searches are run', () => {
        dungTaiLieu();

        knowledge.search('bảo dưỡng');
        knowledge.search('phiếu thu');
        knowledge.search('công nợ');

        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('TC-UNIT-ChatbotKnowledge-016 — _reload forces the file to be read again', () => {
        dungTaiLieu();
        knowledge.search('bảo dưỡng');

        knowledge._reload();
        knowledge.search('bảo dưỡng');

        expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('TC-UNIT-ChatbotKnowledge-017 — an unreadable document file returns empty instead of throwing', () => {
        jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });

        expect(knowledge.search('bảo dưỡng')).toEqual([]);
    });

    it('TC-UNIT-ChatbotKnowledge-018 — an empty document returns empty', () => {
        dungTaiLieu('');

        expect(knowledge.search('bảo dưỡng')).toEqual([]);
    });

    it('TC-UNIT-ChatbotKnowledge-019 — sections are split on level 1 and level 2 headings', () => {
        dungTaiLieu();
        // Ba mục đủ dài: heading cấp 1 (#) và hai heading cấp 2 (##)
        const kq = knowledge.search('tài xế khách hàng phiếu thu bảo dưỡng', 10);

        expect(kq.map((c) => c.heading).sort()).toEqual(
            ['Công nợ khách hàng', 'Phiếu thu tiền mặt', 'Quy trình bảo dưỡng xe'],
        );
    });
});
