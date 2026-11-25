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
2. App mein **Settings → Users / Staff** mein us user ko **Staff** bana dein.
3. Staff ko email aur password bata dein. Wo login screen par **Cashier** tab se login kare.

---

## App kaise chalayein
| Screen | Kaam |
|---|---|
| **Dashboard** | Aaj ki sale (Cash/Udhaar), munafa, udhaar baqi, kam stock, 7 din ka chart, aakhri sales. |
| **POS / Billing** | Item dhoondein (F2) ya Quick pick se chunein, quantity aur unit (kg/gram, feet/meter, cylinder), Cash ya Udhaar, phir Complete Sale (F4). Stock khud kam ho jata hai. |
| **POS → customer chunein** | Customer ka pichla udhaar, 📄 Statement (WhatsApp par bhi), aur ↩ Return items (maal wapis, khata kam). |
| **Sales History** | Din/hafta/mahina, cashier aur type se filter. Bill dobara print, Cancel, aur cash wala Return (sirf owner). Returns aur munafa bhi. |
| **Customers & Khata** | Har customer ka udhaar, credit limit, Receive (wasooli), WhatsApp yaad-dihani, poora hisaab. |
| **Products** | Saare items, stock, rate, cost aur margin. Add / Edit, Export CSV. |
| **Inventory** | Stock ki qeemat, kam stock, Adjust (toot phoot / ginti), stock movements, aur low stock list (picture ya text) WhatsApp par. |
| **Purchase** | Naya maal aaye to entry, ya supplier ka bill **Excel se Import**. Stock aur khareed rate khud update. |

## Owner aur Staff (Cashier) ka farq
| | Owner | Cashier |
|---|---|---|
| Sale karna (Cash / Udhaar) | ✅ | ✅ |
| Customer ka udhaar aur statement dekhna (POS mein) | ✅ | ✅ |
| Udhaar wale maal ka return | ✅ | ✅ |
| Cash sale ka return, sale cancel | ✅ | ❌ |
| Products dekhna | ✅ | ✅ (bina cost/margin) |
| Dashboard, Sales History, Khata, Inventory, Purchase | ✅ | ❌ |
| Wasooli (udhaar ke paise lena) | ✅ | ❌ |
| Users manage karna | ✅ | ❌ |

## Backup
Har raat database ka backup private repo `cool-care-backup` mein khud banta hai (10 din tak). Tareeqa usi repo ki README mein hai.

## Bill par phone aur address
`config.js` mein `SHOP_PHONE` aur `SHOP_ADDRESS` bhar dein, phir file GitHub par dobara upload karein.

## ⚠️ Kabhi na karein
- `config.js` mein **secret key**, **service_role key** ya **database password** na likhein. GitHub par code sab dekh sakte hain.
- Supabase project 1 hafta bilkul istemal na ho to pause ho jata hai. Dashboard se **Restore** dabayein, data mehfooz rehta hai.
