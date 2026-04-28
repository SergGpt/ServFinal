<!-- Добавляем после <script> если нет -->
import { addListernEvent } from "api/functions";

<!-- Ищем -->
<!-- let numberValue; -->
<!-- Добавляем после -->
addListernEvent("phone.messages.popUp.setTarget", (target) => numberValue = target);