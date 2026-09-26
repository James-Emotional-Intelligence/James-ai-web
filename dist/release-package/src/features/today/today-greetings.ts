export interface GreetingQuestionItem {
  id: string;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  question: string;
  placeholder: string;
  fallbackReply: string;
}

export const TODAY_GREETING_QUESTIONS: GreetingQuestionItem[] = [
  // MORNING (5h - 11h59)
  {
    id: 'm1',
    timeSlot: 'morning',
    question: 'Chào buổi sáng! Hôm nay cậu cảm thấy thế nào, đã sẵn sàng chinh phục các môn học chưa?',
    placeholder: 'Chia sẻ năng lượng buổi sáng của cậu...',
    fallbackReply: 'Chúc cậu một buổi sáng tràn đầy hứng khởi và hoàn thành thật tốt các mục tiêu hôm nay nhé!',
  },
  {
    id: 'm2',
    timeSlot: 'morning',
    question: 'Chào buổi sáng! Sáng nay cậu có tiết học nào quan trọng cần chuẩn bị trước không?',
    placeholder: 'Ví dụ: Sáng nay có bài kiểm tra Toán...',
    fallbackReply: 'Dù là môn nào, cứ bình tĩnh ôn lại kiến thức cốt lõi là sẽ làm bài thật tốt thôi!',
  },
  {
    id: 'm3',
    timeSlot: 'morning',
    question: 'Chào ngày mới! Cậu đã ăn sáng và nạp đủ năng lượng cho ngày học hôm nay chưa?',
    placeholder: 'Nhập câu trả lời của cậu...',
    fallbackReply: 'Nhớ uống đủ nước và giữ tinh thần thoải mái để học tập hiệu quả suốt cả ngày nhé!',
  },
  {
    id: 'm4',
    timeSlot: 'morning',
    question: 'Chào buổi sáng! Mục tiêu số 1 mà cậu muốn đạt được trong ngày hôm nay là gì?',
    placeholder: 'Ví dụ: Hoàn thành bài tập Văn, giải xong đề Toán...',
    fallbackReply: 'Hãy tập trung làm từng việc một, Jami tin cậu sẽ đạt được mục tiêu hôm nay!',
  },
  {
    id: 'm5',
    timeSlot: 'morning',
    question: 'Chào buổi sáng! Hôm nay thời tiết có ủng hộ việc học tập của cậu không?',
    placeholder: 'Thời tiết hôm nay thế nào...',
    fallbackReply: 'Dù thời tiết ra sao, tinh thần tự học chủ động vẫn là chìa khóa giúp cậu bứt phá!',
  },

  // AFTERNOON (12h - 17h59)
  {
    id: 'a1',
    timeSlot: 'afternoon',
    question: 'Chào buổi chiều! Buổi sáng của cậu diễn ra thế nào, có gặp khó khăn ở tiết học nào không?',
    placeholder: 'Kể cho Jami nghe buổi sáng của cậu nhé...',
    fallbackReply: 'Mỗi ngày đều có những thử thách thú vị, cùng Jami bứt phá trong buổi chiều nay nhé!',
  },
  {
    id: 'a2',
    timeSlot: 'afternoon',
    question: 'Chào buổi chiều! Cậu đã nghỉ trưa nạp lại năng lượng để bắt đầu ca học mới chưa?',
    placeholder: 'Tình trạng năng lượng của cậu bây giờ...',
    fallbackReply: 'Cố gắng duy trì sự tập trung, nếu mệt hãy vươn vai thư giãn 2 phút rồi tiếp tục nhé!',
  },
  {
    id: 'a3',
    timeSlot: 'afternoon',
    question: 'Chào buổi chiều! Chiều nay cậu dự định hoàn thành những bài tập nào?',
    placeholder: 'Nhập kế hoạch chiều nay của cậu...',
    fallbackReply: 'Rất tuyệt! Hãy ưu tiên giải quyết các bài tập gấp trước để tối rảnh rang hơn nhé.',
  },
  {
    id: 'a4',
    timeSlot: 'afternoon',
    question: 'Chào buổi chiều! Cậu đã cập nhật lại bài học và BTVN của các tiết trên lớp hôm nay chưa?',
    placeholder: 'Ghi chú nhanh tình hình bài vở...',
    fallbackReply: 'Đừng quên bấm vào "Nhập bài học & BTVN" bên dưới để lưu lại kịp thời nhé!',
  },
  {
    id: 'a5',
    timeSlot: 'afternoon',
    question: 'Chào buổi chiều! Năng lượng học tập lúc này của cậu đang ở mức mấy sao (1-5)?',
    placeholder: 'Ví dụ: 5 sao tràn đầy quyết tâm...',
    fallbackReply: 'Jami luôn ở đây đồng hành để giúp cậu tối ưu hóa từng phút tự học chất lượng nhất!',
  },

  // EVENING (18h - 4h59)
  {
    id: 'e1',
    timeSlot: 'evening',
    question: 'Chào buổi tối! Hôm nay ở trường cậu học được điều gì thú vị nhất?',
    placeholder: 'Kể cho Jami điều cậu tâm đắc hôm nay...',
    fallbackReply: 'Thật tuyệt khi mỗi ngày cậu đều tích lũy thêm những kiến thức bổ ích!',
  },
  {
    id: 'e2',
    timeSlot: 'evening',
    question: 'Chào buổi tối! Tối nay cậu dự định tự học bao nhiêu phút trước khi đi ngủ?',
    placeholder: 'Ví dụ: 60 phút, 90 phút...',
    fallbackReply: 'Hãy chia nhỏ thời gian học theo phương pháp Pomodoro để không bị quá tải nhé!',
  },
  {
    id: 'e3',
    timeSlot: 'evening',
    question: 'Chào buổi tối! Cậu còn bao nhiêu bài tập về nhà chưa giải quyết xong?',
    placeholder: 'Tình trạng BTVN tối nay...',
    fallbackReply: 'Làm hết BTVN sớm sẽ giúp giấc ngủ ngon hơn và tự tin đón ngày học ngày mai!',
  },
  {
    id: 'e4',
    timeSlot: 'evening',
    question: 'Chào buổi tối! Cậu đã chuẩn bị sách vở và đồ dùng cho ngày mai chưa?',
    placeholder: 'Chia sẻ tiến độ chuẩn bị...',
    fallbackReply: 'Chuẩn bị trước sách vở buổi tối giúp buổi sáng mai thư thái và tự tin hơn rất nhiều.',
  },
  {
    id: 'e5',
    timeSlot: 'evening',
    question: 'Chào buổi tối! Sau một ngày học tập vất vả, cậu có cần Jami hỗ trợ giải đáp câu hỏi nào không?',
    placeholder: 'Cậu muốn hỏi gì Jami không...',
    fallbackReply: 'Bất cứ lúc nào cần hỗ trợ giải bài hay tóm tắt kiến thức, Jami luôn sẵn sàng cùng cậu!',
  },
];

export function getCurrentTimeSlot(date: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  try {
    const vnFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(vnFormatter.format(date), 10);
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  } catch {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }
}

export function getRandomGreetingQuestion(date: Date = new Date()): GreetingQuestionItem {
  const slot = getCurrentTimeSlot(date);
  const matched = TODAY_GREETING_QUESTIONS.filter((q) => q.timeSlot === slot);
  if (matched.length === 0) return TODAY_GREETING_QUESTIONS[0];
  const randomIndex = Math.floor(Math.random() * matched.length);
  return matched[randomIndex];
}
