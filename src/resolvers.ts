import * as tableObjectResolvers from "./resolvers/tableObject.js"

export const resolvers = {
	Query: {
		tableObjectsByCollection: tableObjectResolvers.tableObjectsByCollection
	}
}
