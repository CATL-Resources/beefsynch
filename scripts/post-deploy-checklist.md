# Post-Deploy Checklist

After every push to main, walk through this list before closing the laptop.

- [ ] Load **beefsynch.com** — does it load?
- [ ] Log in — does auth work?
- [ ] Open **Hub** — do stats load?
- [ ] Open one **project** — does billing data appear?
- [ ] Open **Inventory** — do tanks and counts load?
- [ ] Check **browser console** — any red errors?

If anything fails: `git revert HEAD && git push`
