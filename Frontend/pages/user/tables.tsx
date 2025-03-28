import React from "react";

// components

import CardTable from "../../components/Cards/CardTable";

// layout for page

import Admin from "../../layouts/Admin";

export default function Tables() {
  return (
    <>
      <div className="flex flex-wrap mt-4">
        <div className="w-full mb-12 px-4">
          <CardTable />
        </div>
        <div className="w-full mb-12 px-4">
          <CardTable color="dark" />
        </div>
      </div>
    </>
  );
}

// Tables.layout = Admin;
Tables.getLayout= function getLayout(page:any){
  return (
    <Admin>{page}</Admin>
  )
}