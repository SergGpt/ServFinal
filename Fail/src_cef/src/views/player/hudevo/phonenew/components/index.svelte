<!-- Ищем addListernEvent ("isPhoneCall", isPhoneCall) -->
<!-- Добавляем после -->

addListernEvent("phone.setPage", (pageName) => currentPage.set(pageName));