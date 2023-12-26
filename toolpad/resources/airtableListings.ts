/**
 * Toolpad data provider file.
 * See: https://mui.com/toolpad/concepts/data-providers/
 */

import { createDataProvider } from "@mui/toolpad/server";

export default createDataProvider({
  paginationMode: "cursor",
  async getRecords({ paginationModel: { cursor, pageSize } }) {
    let url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE}/Listings?view=${process.env.AIRTABLE_VIEW}`;
    if (cursor) {
      url = url + `?offset=${cursor}`;
    }
    if (pageSize) {
      url = url + `&pageSize=${pageSize}`;
    }
    const response = await fetch(
      url,

      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
        },
      }
    ).then((res) => res.json());

    return {
      records: response.records.map((record) => ({
        id: record.id,
        projectName: record.fields["Project name"],
        createdTime: record.createdTime,
        uploadImages: record.fields["Upload image(s)"],
        file: record.fields["File (from Images)"],
      })),
      cursor: response.offset ?? null,
    };
  },
});
