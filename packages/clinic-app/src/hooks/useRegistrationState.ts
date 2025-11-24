import React from "react";

export function useRegistrationState() {
  const [personalInformation, setPersonalInformation] = React.useState({});
  const [basicInformation, setBasicInformation] = React.useState({});
  const [clinicApplication, setClinicApplication] = React.useState({});

  return {
    personalInformation: {
      data: personalInformation,
      setData: setPersonalInformation,
    },
    basicInformation: {
      data: basicInformation,
      setData: setBasicInformation,
    },
    clinicApplication: {
      data: clinicApplication,
      setData: setClinicApplication,
    },
  };
}