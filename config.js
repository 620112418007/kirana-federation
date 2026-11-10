/* ค่าตั้งของหน้าเกม สหพันธรัฐแห่งคีรันนา แก้ไฟล์นี้บน GitHub ได้โดยตรง ไม่ต้องแตะ index.html
   googleClient: OAuth Client ID ชนิด Web application จาก Google Cloud Console (ลงท้าย .apps.googleusercontent.com)
                 ไม่ใช่ความลับ ว่างไว้ = ปิดการลงชื่อเข้าใช้ ผู้เล่นจะบันทึกเกมไม่ได้ ยกเว้นเครื่องผู้พัฒนา
   hofEndpoint:  ที่อยู่ Web app ของสคริปต์หอเกียรติยศ (scripts/hof-apps-script.gs ลงท้าย /exec)
                 ว่างไว้ = ผู้ชนะต้องกดส่งเข้าหอเกียรติยศผ่าน GitHub เอง */
window.FED_CONFIG = {
  googleClient: '286580144013-1nedsastjt4f84r2o8o7plekhmjcktsm.apps.googleusercontent.com',
  hofEndpoint: 'https://script.google.com/macros/s/AKfycbxzSVlfrSToxawT6Vlq2VVom_a5oPEqVoPlzh4-tD8Vz0JSRW-BRq_7Q8jfreeGkP02/exec',
};
