export type RoleQuestion = {
  id: string;
  labelHe: string;
  labelEn: string;
  options: string[];
};

export const CATEGORY_QUESTION_MAP: Record<string, string> = {
  'Video Photographer': 'Videographer',
  'Still Photographer': 'Photographer',
  'Editor': 'Editor',
  'Graphic Designer': 'Graphic Designer',
  'Social Media': 'Social Media',
  'Studio & Audio': 'Studios and Music',
  'Lighting Tech': 'Lighting Technician',
  'Sound Recordist': 'Soundman',
};

export const ROLE_QUESTIONS: Record<string, RoleQuestion[]> = {
  'Videographer': [
    { id: 'shootingHours', labelHe: 'כמה שעות צילום?', labelEn: 'How many shooting hours?', options: ['1-2', '3-4', '5-8', '8+'] },
    { id: 'locationType', labelHe: 'היכן הצילום?', labelEn: 'Shooting location type?', options: ['פנים/Indoors', 'חוץ/Outdoors', 'שניהם/Both'] },
    { id: 'locations', labelHe: 'כמה לוקיישנים?', labelEn: 'How many locations?', options: ['1', '2-3', '4+'] },
    { id: 'equipment', labelHe: 'ציוד?', labelEn: 'Equipment?', options: ['יביא ציוד/Brings equipment', 'יש לי ציוד/I have equipment'] },
  ],
  'Photographer': [
    { id: 'shootingHours', labelHe: 'כמה שעות צילום?', labelEn: 'How many shooting hours?', options: ['1-2', '3-4', '5-8', '8+'] },
    { id: 'locationType', labelHe: 'היכן הצילום?', labelEn: 'Shooting location type?', options: ['פנים/Indoors', 'חוץ/Outdoors', 'שניהם/Both'] },
    { id: 'deliverables', labelHe: 'כמה תמונות סופיות?', labelEn: 'Final photos delivered?', options: ['עד 50', '50-150', '150-300', '300+'] },
    { id: 'equipment', labelHe: 'ציוד?', labelEn: 'Equipment?', options: ['יביא ציוד/Brings equipment', 'יש לי ציוד/I have equipment'] },
  ],
  'Editor': [
    { id: 'finalLength', labelHe: 'אורך הסרטון הסופי?', labelEn: 'Final video length?', options: ['עד 1 דק', '1-3 דק', '3-10 דק', '10+ דק'] },
    { id: 'rawFootage', labelHe: 'כמה חומר גולמי?', labelEn: 'Raw footage amount?', options: ['עד שעה', '1-3 שעות', '3-8 שעות', '8+ שעות'] },
    { id: 'colorGrading', labelHe: 'תיקון צבע?', labelEn: 'Color grading needed?', options: ['כן/Yes', 'לא/No'] },
    { id: 'platform', labelHe: 'לאיזה פלטפורמה?', labelEn: 'Target platform?', options: ['Instagram/Reels', 'YouTube', 'TikTok', 'טלוויזיה/TV', 'אחר/Other'] },
    { id: 'aiEditing', labelHe: 'צריך עריכת AI?', labelEn: 'AI editing needed?', options: ['כן/Yes', 'לא/No'] },
  ],
  'Graphic Designer': [
    { id: 'deliverableType', labelHe: 'מה צריך?', labelEn: 'What do you need?', options: ['לוגו/Logo', 'פוסטר/Poster', 'מיתוג/Branding', 'סושיאל/Social media', 'אחר/Other'] },
    { id: 'variations', labelHe: 'כמה וריאציות?', labelEn: 'How many variations?', options: ['1', '2-3', '4+'] },
    { id: 'hasBrand', labelHe: 'יש מדריך מיתוג?', labelEn: 'Existing brand guidelines?', options: ['כן/Yes', 'לא/No'] },
    { id: 'fileFormat', labelHe: 'פורמט קבצים?', labelEn: 'File format needed?', options: ['JPG/PNG', 'PDF', 'AI/PSD', 'הכל/All'] },
  ],
  'Social Media': [
    { id: 'platforms', labelHe: 'אילו פלטפורמות?', labelEn: 'Which platforms?', options: ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'כולם/All'] },
    { id: 'postsPerMonth', labelHe: 'כמה פוסטים בחודש?', labelEn: 'Posts per month?', options: ['1-4', '5-12', '13-20', '20+'] },
    { id: 'serviceType', labelHe: 'מה השירות?', labelEn: 'Type of service?', options: ['ניהול בלבד/Management only', 'יצירת תוכן/Content creation', 'שניהם/Both'] },
    { id: 'paidAds', labelHe: 'ניהול פרסום ממומן?', labelEn: 'Paid ads management?', options: ['כן/Yes', 'לא/No'] },
  ],
  'Studios and Music': [
    { id: 'tracks', labelHe: 'כמה שירים/טראקים?', labelEn: 'How many tracks?', options: ['1', '2-4', '5-10', '10+'] },
    { id: 'studioHours', labelHe: 'כמה שעות סטודיו?', labelEn: 'Estimated studio hours?', options: ['1-3', '4-8', '8-20', '20+'] },
    { id: 'mixMaster', labelHe: 'מיקס ומאסטרינג?', labelEn: 'Mixing and mastering?', options: ['כן/Yes', 'לא/No'] },
    { id: 'startingPoint', labelHe: 'מנקודת התחלה?', labelEn: 'Starting from?', options: ['הקלטות קיימות/Existing recordings', 'מאפס/Scratch'] },
  ],
  'Soundman': [
    { id: 'eventType', labelHe: 'סוג האירוע?', labelEn: 'Event type?', options: ['קונצרט/Concert', 'כנס/Conference', 'חתונה/Wedding', 'אחר/Other'] },
    { id: 'hours', labelHe: 'כמה שעות?', labelEn: 'How many hours?', options: ['1-3', '4-6', '7-12', '12+'] },
    { id: 'locationType', labelHe: 'פנים או חוץ?', labelEn: 'Indoor or outdoor?', options: ['פנים/Indoor', 'חוץ/Outdoor'] },
    { id: 'microphones', labelHe: 'כמה מיקרופונים?', labelEn: 'Microphones needed?', options: ['1-2', '3-5', '6-10', '10+'] },
  ],
  'Lighting Technician': [
    { id: 'eventType', labelHe: 'סוג האירוע?', labelEn: 'Event type?', options: ['קונצרט/Concert', 'כנס/Conference', 'חתונה/Wedding', 'צילום/Shoot', 'אחר/Other'] },
    { id: 'hours', labelHe: 'כמה שעות?', labelEn: 'How many hours?', options: ['1-3', '4-6', '7-12', '12+'] },
    { id: 'locationType', labelHe: 'פנים או חוץ?', labelEn: 'Indoor or outdoor?', options: ['פנים/Indoor', 'חוץ/Outdoor'] },
    { id: 'equipment', labelHe: 'ציוד?', labelEn: 'Equipment?', options: ['יביא ציוד/Brings equipment', 'יש לי ציוד/I have equipment'] },
  ],
};

export function questionsForCategory(category: string): RoleQuestion[] {
  const key = CATEGORY_QUESTION_MAP[category];
  return key ? (ROLE_QUESTIONS[key] ?? []) : [];
}

export function questionLabel(q: RoleQuestion, isHe: boolean): string {
  return isHe ? q.labelHe : q.labelEn;
}
