/**
 * Astronomy Terminology Dictionary
 * Translates NASA API technical terms (discovery methods, spectral types, etc.) to Vietnamese.
 */

export const AstronomyDictionary: Record<string, Record<string, string>> = {
  // Discovery Methods
  'Transit': { vi: 'Quá cảnh (Transit)' },
  'Radial Velocity': { vi: 'Vận tốc xuyên tâm (Radial Velocity)' },
  'Microlensing': { vi: 'Vi thấu kính hấp dẫn (Microlensing)' },
  'Imaging': { vi: 'Chụp ảnh trực tiếp (Imaging)' },
  'Transit Timing Variations': { vi: 'Biến thiên thời gian quá cảnh' },
  'Eclipse Timing Variations': { vi: 'Biến thiên thời gian thiên thực' },
  'Orbital Brightness Modulation': { vi: 'Biến thiên độ sáng quỹ đạo' },
  'Pulsar Timing': { vi: 'Chu kỳ Pulsar' },
  'Pulsation Timing Variations': { vi: 'Biến thiên chu kỳ xung' },
  'Astrometry': { vi: 'Đo vị trí sao (Astrometry)' },
  'Disk Kinematics': { vi: 'Động học đĩa mây (Disk Kinematics)' },
  'Naked Eye (Origin)': { vi: 'Mắt thường (Gốc)' },

  // Size Categories
  'sub-Earth': { vi: 'Nhỏ hơn Trái Đất (Sub-Earth)' },
  'Earth-like': { vi: 'Cỡ Trái Đất (Earth-like)' },
  'super-Earth': { vi: 'Siêu Trái Đất (Super-Earth)' },
  'mini-Neptune': { vi: 'Tiểu sao Hải Vương (Mini-Neptune)' },
  'Neptune-like': { vi: 'Cỡ sao Hải Vương (Neptune-like)' },
  'gas-giant': { vi: 'Khổng lồ khí (Gas Giant)' },
  'Star': { vi: 'Ngôi sao (Star)' },

  // Special terms
  'Unknown': { vi: 'Chưa rõ (Unknown)' },
  'Sol': { vi: 'Hệ Mặt Trời (Sol)' }
}

export function translateTerm(term: string | null | undefined, lng: string): string {
  if (!term) return lng === 'vi' ? 'Không xác định' : 'Unknown'
  
  if (lng === 'vi') {
    return AstronomyDictionary[term]?.vi || term
  }
  return term // Fallback to original English term
}
