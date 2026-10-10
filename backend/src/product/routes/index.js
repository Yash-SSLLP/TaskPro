/**
 * /api/tasks — every task route. Literal paths (/meta, /categories,
 * /templates, /recurring, /dashboard, /board, /export, /counters) are mounted
 * before /:id so none of them is read as a task id.
 */
const express = require('express');
const { protect } = require('../../platform/auth');

const router = express.Router();
router.use(protect);

router.use('/', require('./meta'));
router.use('/recurring', require('./recurring'));
router.use('/dashboard', require('./dashboard'));
router.use('/', require('./tasks'));
router.use('/', require('./actions'));

module.exports = router;
