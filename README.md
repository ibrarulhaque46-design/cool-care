# Ibrar & Brothers Cool Care — Setup Guide

AC aur fridge spare parts ki shop ke liye stock aur sale app. Laptop aur mobile dono par chalti hai.

## Files
| File | Kaam |
|---|---|
| `database.sql` | Supabase mein database banane ke liye (sirf ek dafa chalani hai) |
| `index.html`, `app.js`, `style.css` | App |
| `config.js` | Shop ka naam, phone, address aur Supabase ka URL |
| `manifest.json`, `sw.js`, `icons/` | Mobile par install karne ke liye |

---

## Qadam 1: Database banana (Supabase)
1. supabase.com par apna **Cool Care** project kholein.
2. Left side par **SQL Editor** par click karein.
3. **New query** dabayein.
4. `database.sql` file kholein, sab kuch copy karein (Ctrl+A, phir Ctrl+C) aur wahan paste karein.
5. **Run** dabayein. Neeche "Success" aana chahiye.

## Qadam 2: Apna Owner account banana
1. Supabase mein **Authentication** → **Users** par jayein.
2. **Add user** → **Create new user** dabayein.
3. Apna email aur ek mazboot password likhein.
4. **Auto Confirm User** par tick lagayein.
5. **Create user** dabayein.

**Jo pehla user banta hai wo khud Owner ban jata hai.** Is liye pehle apna account banayein, staff ka baad mein.

## Qadam 3 (zaroori security): naye signup band karna
1. **Authentication** → **Sign In / Providers** (ya **Settings**) par jayein.
2. **Allow new users to sign up** ko **OFF** kar dein.

Ab koi bahar ka banda khud account nahi bana sakega. Users sirf aap banayenge.

## Qadam 4: GitHub par upload
1. github.com par login karein aur **New repository** banayein.
   - Name: `cool-care`
   - **Public** rakhein (free GitHub Pages ke liye zaroori hai)
2. **"uploading an existing file"** link par click karein.
3. `cool-care` folder ki **saari files aur `icons` folder** drag karke daal dein.
4. **Commit changes** dabayein.
5. Repository mein **Settings** → **Pages** par jayein.
6. **Branch** mein `main` aur `/ (root)` chunein, phir **Save** dabayein.
7. 1 se 2 minute baad link milega, kuch is tarah:
   `https://<aap-ka-github-naam>.github.io/cool-care/`

Yahi link laptop aur mobile dono par kholein.

## Qadam 5: Mobile par install
- **Android (Chrome):** link kholein → ⋮ → **Add to Home screen** ya **Install app**
- **iPhone (Safari):** link kholein → Share ⬆ → **Add to Home Screen**

## Qadam 6: Staff add karna
1. Supabase → **Authentication** → **Users** → **Add user** (Auto Confirm ke saath).
2. App mein **Menu** → **Users** mein us user ko **Staff** bana dein.
3. Staff ko email aur password bata dein.

---

## App kaise chalayein
| Screen | Kaam |
|---|---|
| **Sale** | Item dhoondein, quantity aur unit (kg/gram, feet/meter, cylinder) chunein, phir Save. Stock khud kam ho jata hai. |
| **Stock** | Saare items. Owner yahan naya item add karta hai ya rate badalta hai. |
| **Kam Stock** | Jo items had se kam hain. "List bhejein" se WhatsApp par bhej sakte hain. |
| **Report** | Aaj, kal, 7 din ya mahine ki sale. Owner ko munafa bhi nazar aata hai. Ghalat sale ko yahin se cancel karein, stock wapis aa jayega. |
| **Menu → Maal aaya** | Naya maal aaye to entry karein, stock barh jayega (sirf owner). |

## Owner aur Staff ka farq
| | Owner | Staff |
|---|---|---|
| Sale karna | ✅ | ✅ |
| Stock dekhna | ✅ | ✅ |
| Khareed rate aur munafa | ✅ | ❌ |
| Item add karna ya rate badalna | ✅ | ❌ |
| Maal aaya (purchase) | ✅ | ❌ |
| Sale cancel karna | ✅ | ❌ |
| Users manage karna | ✅ | ❌ |

## Bill par phone aur address
`config.js` mein `SHOP_PHONE` aur `SHOP_ADDRESS` bhar dein, phir file GitHub par dobara upload karein.

## ⚠️ Kabhi na karein
- `config.js` mein **secret key**, **service_role key** ya **database password** na likhein. GitHub par code sab dekh sakte hain.
- Supabase project 1 hafta bilkul istemal na ho to pause ho jata hai. Dashboard se **Restore** dabayein, data mehfooz rehta hai.
