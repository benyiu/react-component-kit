// Which auth card is showing.
//
// Five cards share one screen — login, first-run setup, forgot password, reset
// password, register — and exactly one is visible at a time. That was five
// `classList.toggle` calls per transition, written out in each of the five
// `show*` functions, which is twenty-five places for one fact. A card that
// forgot to hide itself in one of them stayed on screen under the next.
//
// As state it is one value. The shell still decides *when* to change it; what
// it no longer does is describe the whole screen every time it does.
import { createStore } from '../core/store.js';

const AuthCardStore = createStore({
  // 'login' | 'setup' | 'forgot-password' | 'reset-password' | 'register'
  // null before the shell has decided, which is the state the pre-hide script
  // leaves the page in.
  card: null,
});

function showAuthCard(card) {
  AuthCardStore.card = card || null;
}

export { AuthCardStore, showAuthCard };
