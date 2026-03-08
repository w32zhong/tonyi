import { createRouter, createWebHashHistory } from 'vue-router';
import FileBrowser from './views/FileBrowser.vue';

const routes = [
  {
    path: '/:path(.*)*',
    name: 'browser',
    component: FileBrowser
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
