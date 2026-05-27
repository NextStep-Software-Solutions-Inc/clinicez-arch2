// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import m0000 from "./0000_bizarre_brother_voodoo.sql";
import m0001 from "./0001_worried_mesmero.sql";
import m0002 from "./0002_crazy_thanos.sql";
import m0003 from "./0003_previous_ghost_rider.sql";
import journal from "./meta/_journal.json";

export default {
	journal,
	migrations: {
		m0000,
		m0001,
		m0002,
		m0003,
	},
};
