<!-- Добавляем после <script> если нет -->
import { addListernEvent } from "api/functions";

<!-- Ищем  -->
<!-- let isPopup = false; -->
<!-- Добавляем после -->
addListernEvent("phone.messages.openPopup", () => isPopup = true);